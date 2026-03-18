/**
 * IAM Drift Intelligence — Enrichment Stage 5: Final Assembly
 *
 * Purpose:
 *   Closes the enrichment pipeline and produces the final publishable finding.
 *   This is the only stage that touches the scan record and account health score.
 *
 *   Computes:
 *     - permission_count_after (from proposed_policy)
 *     - permission_reduction_pct
 *     - blast_radius (reachable_services from proposed, critical_paths from AI data)
 *     - terraform_export (generated programmatically from proposed_policy)
 *
 *   Sets final workflow state:
 *     - finding_status: 'READY'
 *     - workflow_state: 'ready_for_review'
 *     - next_action_required: 'reviewer_decision_needed'
 *     - enrichment_completed_at
 *
 *   Side effects:
 *     - Updates scan record: health_score (recomputed across all findings for this scan)
 *     - Updates account record: health_score + health_score_history
 *     - SNS alert: if risk_level is HIGH/CRITICAL and alert_sent is false
 *
 * DynamoDB writes:
 *   - All of the above on the finding
 *   - Scan record: health_score
 *   - Account record: health_score, health_score_history
 *
 * Failure behavior:
 *   If metric computation fails, the finding is still published in its
 *   current state (with whatever Stage 3+4 populated). Health score update
 *   and SNS are attempted but non-fatal.
 */

import { EnrichmentContext, StageResult } from './types';
import { IamFinding, IamAccount, PolicyDocument, BlastRadius } from '../../types';
import { getRepositories } from '../../repositories';
import { publishAlert, getAlertTopicArn } from '../../lib/sns';

// Risk score threshold for SNS alert
const ALERT_RISK_SCORE_THRESHOLD = 13; // HIGH or above

export async function runStage5(ctx: EnrichmentContext): Promise<StageResult> {
  const { finding } = ctx;
  const now = new Date().toISOString();

  // ── Compute permission_count_after from proposed_policy ──────────────────
  const proposedActions = extractAllowActions(finding.proposed_policy);
  const permissionCountAfter = proposedActions.length;
  const permissionReductionPct =
    finding.permission_count_before > 0
      ? Math.round(
          ((finding.permission_count_before - permissionCountAfter) /
            finding.permission_count_before) *
            1000
        ) / 10
      : 0;

  // ── Blast radius ──────────────────────────────────────────────────────────
  const blastRadius = computeBlastRadius(finding);

  // ── Terraform export ──────────────────────────────────────────────────────
  const terraformExport = generateTerraformExport(
    finding.role_name,
    finding.proposed_policy,
    finding.account_id
  );

  // ── Final workflow state ──────────────────────────────────────────────────
  const updates: Partial<IamFinding> = {
    permission_count_after: permissionCountAfter,
    permission_reduction_pct: permissionReductionPct,
    blast_radius: blastRadius,
    terraform_export: terraformExport,
    finding_status: 'READY',
    workflow_state: 'ready_for_review',
    next_action_required: 'reviewer_decision_needed',
    enrichment_completed_at: now,
    last_updated_at: now,
  };

  // ── Side effects: health score + SNS ─────────────────────────────────────
  // These are best-effort — don't let them fail the stage
  await updateHealthScores(finding.scan_id, finding.account_id, finding.risk_score).catch((err) =>
    console.warn('[stage5] Health score update failed (non-fatal):', err)
  );

  await maybeSendAlert(finding, permissionReductionPct).catch((err) =>
    console.warn('[stage5] SNS alert failed (non-fatal):', err)
  );

  console.log(
    `[stage5] Assembly complete for ${finding.role_name} — ` +
    `${finding.permission_count_before}→${permissionCountAfter} permissions ` +
    `(${permissionReductionPct}% reduction)`
  );

  return { stage: 5, success: true, updates };
}

// ─── Permission Extraction ────────────────────────────────────────────────────

function extractAllowActions(policy: PolicyDocument): string[] {
  const actions = new Set<string>();
  for (const stmt of policy.Statement) {
    if (stmt.Effect !== 'Allow') continue;
    const stmtActions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
    for (const a of stmtActions) {
      if (a) actions.add(a.toLowerCase());
    }
  }
  return Array.from(actions);
}

// ─── Blast Radius ─────────────────────────────────────────────────────────────

function computeBlastRadius(finding: IamFinding): BlastRadius {
  // Reachable services = services in the PROPOSED policy (after remediation)
  const reachableServices = (finding.services_after.length > 0
    ? finding.services_after
    : finding.services_before
  ).sort();

  // Critical paths: any remaining wildcard actions or high-impact services
  const criticalPaths: string[] = [];

  // Flag any remaining wildcards in the proposed policy
  for (const stmt of finding.proposed_policy.Statement) {
    if (stmt.Effect !== 'Allow') continue;
    const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
    for (const action of actions) {
      if (action === '*' || /^[a-z0-9-]+:\*$/i.test(action)) {
        criticalPaths.push(`${action} (wildcard retained in proposed policy)`);
      }
    }
  }

  // Flag critical AWS services in reachable list
  const highImpactServices = ['iam', 'sts', 'kms', 'secretsmanager', 'organizations'];
  for (const svc of reachableServices) {
    if (highImpactServices.includes(svc)) {
      criticalPaths.push(`${svc} access retained — requires careful scoping`);
    }
  }

  // Blast radius risk level = same as the finding risk level
  // (post-remediation blast radius is assessed separately, but for now mirrors the finding)
  return {
    reachable_services: reachableServices,
    critical_paths: criticalPaths,
    risk_level: finding.risk_level,
  };
}

// ─── Terraform Export ─────────────────────────────────────────────────────────

function generateTerraformExport(
  roleName: string,
  proposedPolicy: PolicyDocument,
  accountId: string
): string {
  if (proposedPolicy.Statement.length === 0) return '';

  const resourceName = roleName
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();

  const stmtLines = proposedPolicy.Statement.map((stmt) => {
    const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
    const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource];
    const actionStr =
      actions.length === 1
        ? `"${actions[0]}"`
        : `[\n          ${actions.map((a) => `"${a}"`).join(',\n          ')}\n        ]`;
    const resourceStr =
      resources.length === 1
        ? `"${resources[0]}"`
        : `[\n          ${resources.map((r) => `"${r}"`).join(',\n          ')}\n        ]`;
    const sid = stmt.Sid ? `        Sid    = "${stmt.Sid}"\n` : '';
    return `      {\n${sid}        Effect   = "${stmt.Effect}"\n        Action   = ${actionStr}\n        Resource = ${resourceStr}\n      }`;
  }).join(',\n');

  return `resource "aws_iam_policy" "${resourceName}_least_privilege" {
  name        = "${roleName}-least-privilege"
  description = "Least-privilege policy for ${roleName} (IAM Drift remediation)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
${stmtLines}
    ]
  })
}`;
}

// ─── Health Score ─────────────────────────────────────────────────────────────

/**
 * Health score formula:
 *   score = 100 - (avg_risk_score_of_READY_findings / 22 * 100)
 *   22 = CRITICAL threshold (max meaningful risk score per role)
 *
 * Only READY findings are included (enrichment complete, awaiting review).
 * The current finding (being assembled right now) is included explicitly
 * since its DB state hasn't been committed to READY yet.
 * Clamped to [0, 100].
 */
async function updateHealthScores(
  scanId: string,
  accountId: string,
  currentFindingRiskScore: number
): Promise<void> {
  const repos = getRepositories();

  const findings = await repos.findings.listByScanId(scanId);

  // Collect risk scores for all READY findings
  const readyRiskScores = findings
    .filter((f) => f.finding_status === 'READY')
    .map((f) => f.risk_score);

  // Include the current finding — it becomes READY after this stage returns
  readyRiskScores.push(currentFindingRiskScore);

  const avgRiskScore =
    readyRiskScores.reduce((sum, s) => sum + s, 0) / readyRiskScores.length;

  const healthScore = Math.max(
    0,
    Math.min(100, Math.round(100 - (avgRiskScore / 22) * 100))
  );

  const now = new Date().toISOString();

  // Update scan record
  await repos.scans.update(scanId, { health_score: healthScore });

  // Update account record
  const account = await repos.accounts.get(accountId);
  if (account) {
    const newEntry = { scan_id: scanId, score: healthScore, recorded_at: now };
    const updatedHistory = [...account.health_score_history, newEntry].slice(-30); // keep last 30
    await repos.accounts.update(accountId, {
      health_score: healthScore,
      health_score_history: updatedHistory,
      last_scanned_at: now,
    });
  }
}

// ─── SNS Alert ────────────────────────────────────────────────────────────────

async function maybeSendAlert(
  finding: IamFinding,
  permissionReductionPct: number
): Promise<void> {
  const topicArn = getAlertTopicArn();
  if (!topicArn) return;
  if (finding.alert_sent) return;
  if (finding.risk_score < ALERT_RISK_SCORE_THRESHOLD) return;

  const subject = `[IAM Drift] HIGH-Risk Finding: ${finding.role_name} (Score: ${finding.risk_score})`;

  const message = [
    `IAM Drift Intelligence — High-Risk Finding Alert`,
    ``,
    `Role:        ${finding.role_name}`,
    `Account:     ${finding.account_id}`,
    `Risk Level:  ${finding.risk_level} (Score: ${finding.risk_score})`,
    `Scan ID:     ${finding.scan_id}`,
    ``,
    `Wildcard Actions:   ${finding.wildcard_actions.join(', ') || 'None'}`,
    `Unused Services:    ${finding.unused_services.join(', ') || 'None'}`,
    `Permission Reduction: ${permissionReductionPct}%`,
    ``,
    `Intent Gap:`,
    finding.intent_gap || '(AI enrichment pending)',
    ``,
    `Abuse Scenario:`,
    finding.abuse_scenario || '(AI enrichment pending)',
    ``,
    `Action Required: Review and approve/reject the proposed remediation in the IAM Drift Intelligence console.`,
  ].join('\n');

  await publishAlert(topicArn, subject, message);

  // Mark alert sent on the finding (update applied by enrichmentController after stage returns)
  finding.alert_sent = true;
}
