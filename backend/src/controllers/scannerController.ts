/**
 * IAM Drift Intelligence — Scanner Controller
 *
 * Orchestrates the full per-account scan workflow:
 *
 *   1. Assume cross-account role → IAMClient for target account
 *   2. Enumerate all customer-managed roles (collectAccountRoles)
 *   3. Normalize each role's merged policy (normalizeRoleData)
 *   4. Run deterministic detection (detectFindings)
 *   5. Assemble IamFinding with deterministic fields; AI fields are empty stubs
 *   6. Write each finding to iam-drift-findings (PutItem)
 *   7. Push enrichment job to SQS (one message per role)
 *   8. Update scan record: increment roles_scanned, write risk counts, set COMPLETE
 *
 * Each role is processed independently — a failure on one role does not abort
 * the others. Role-level errors are logged and counted.
 *
 * Detection is deterministic only. No AI calls happen here.
 */

import { getIamClientForAccount } from '../lib/iam';
import { sendMessage, getEnrichmentQueueUrl } from '../lib/sqs';
import { collectAccountRoles } from '../services/scanner/iamCollector';
import { normalizeRoleData } from '../services/scanner/policyNormalizer';
import { detectFindings } from '../services/scanner/detector';
import { getRepositories } from '../repositories';
import { IamFinding, IamScan, PolicyDocument } from '../types';
import { ScanJobMessage, EnrichmentJobMessage } from '../services/scanner/types';

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function runAccountScan(message: ScanJobMessage): Promise<void> {
  const { scan_id, account_id, account_name, cross_account_role_name } = message;
  const repos = getRepositories();
  const now = () => new Date().toISOString();

  console.log(`[scanner] Starting scan ${scan_id} for account ${account_id} (${account_name})`);

  // ── 1. Ensure scan record exists ────────────────────────────────────────────
  await ensureScanRecord(scan_id, account_id, account_name);

  // ── 2. Assume cross-account role → IAM client ───────────────────────────────
  let iamClient;
  try {
    iamClient = await getIamClientForAccount(account_id, cross_account_role_name);
  } catch (err) {
    console.error(`[scanner] Failed to get IAM client for account ${account_id}:`, err);
    await repos.scans.update(scan_id, {
      scan_status: 'FAILED',
      scan_completed_at: now(),
    });
    throw err; // Return to SQS for retry
  }

  // ── 3. Enumerate all customer-managed roles ─────────────────────────────────
  const rawRoles = await collectAccountRoles(iamClient, account_id);
  console.log(`[scanner] Collected ${rawRoles.length} roles for account ${account_id}`);

  if (rawRoles.length === 0) {
    await repos.scans.update(scan_id, {
      scan_status: 'COMPLETE',
      total_roles_scanned: 0,
      scan_completed_at: now(),
    });
    return;
  }

  // ── 4–7. Process each role: normalize → detect → write → enqueue ────────────
  const scanCreatedAt = now();
  let successCount = 0;
  let errorCount = 0;
  const riskCounts = { HIGH: 0, MEDIUM: 0, LOW: 0, CRITICAL: 0 };

  // Attempt to get enrichment queue URL early — fail fast if misconfigured
  let enrichmentQueueUrl: string;
  try {
    enrichmentQueueUrl = getEnrichmentQueueUrl();
  } catch (err) {
    console.error('[scanner] Enrichment queue URL not configured:', err);
    await repos.scans.update(scan_id, { scan_status: 'FAILED', scan_completed_at: now() });
    throw err;
  }

  for (const rawRole of rawRoles) {
    try {
      await processRole({
        rawRole,
        scanId: scan_id,
        scanCreatedAt,
        enrichmentQueueUrl,
      });

      const normalized = normalizeRoleData(rawRole);
      const detection = detectFindings(normalized);
      riskCounts[detection.risk_level]++;
      successCount++;
    } catch (err) {
      console.error(`[scanner] Failed to process role ${rawRole.role_arn}:`, err);
      errorCount++;
      // Continue — process remaining roles
    }
  }

  // ── 8. Update scan record ───────────────────────────────────────────────────
  await repos.scans.update(scan_id, {
    scan_status: errorCount === rawRoles.length ? 'FAILED' : 'COMPLETE',
    total_roles_scanned: successCount,
    high_risk_count: riskCounts.HIGH + riskCounts.CRITICAL,
    medium_risk_count: riskCounts.MEDIUM,
    low_risk_count: riskCounts.LOW,
    scan_completed_at: now(),
  });

  console.log(
    `[scanner] Scan ${scan_id} complete — ${successCount} roles processed, ${errorCount} errors`
  );
}

// ─── Per-Role Processing ──────────────────────────────────────────────────────

interface ProcessRoleArgs {
  rawRole: Awaited<ReturnType<typeof collectAccountRoles>>[number];
  scanId: string;
  scanCreatedAt: string;
  enrichmentQueueUrl: string;
}

async function processRole({
  rawRole,
  scanId,
  scanCreatedAt,
  enrichmentQueueUrl,
}: ProcessRoleArgs): Promise<void> {
  const repos = getRepositories();
  const now = new Date().toISOString();

  // Normalize merged policy
  const normalized = normalizeRoleData(rawRole);

  // Run deterministic detection
  const detection = detectFindings(normalized);

  // Assemble the IamFinding — deterministic fields fully populated,
  // AI fields are empty stubs (enrichment pipeline fills these in Stage 3)
  const finding: IamFinding = {
    // ── Keys ──
    scan_id: scanId,
    role_id: rawRole.role_arn,

    // ── Role Identity ──
    account_id: rawRole.account_id,
    role_name: rawRole.role_name,
    role_arn: rawRole.role_arn,

    // ── Workflow State ──
    finding_status: 'DETERMINISTIC_COMPLETE',
    ai_status: 'PENDING',
    simulation_status: 'PENDING',
    workflow_state: 'deterministic_complete',
    next_action_required: 'waiting_for_simulation',
    review_decision: 'PENDING',

    // ── Deterministic Risk Assessment ──
    risk_score: detection.risk_score,
    risk_level: detection.risk_level,
    wildcard_actions: detection.wildcard_actions,
    wildcard_resources: detection.wildcard_resources,
    unused_services: detection.unused_services,
    last_used_date: rawRole.last_used_date,

    // ── Permission Metrics (before side only; after is filled by enrichment) ──
    permission_count_before: detection.permission_count_before,
    permission_count_after: 0,
    permission_reduction_pct: 0,
    services_before: detection.services_before,
    services_after: [],

    // ── Policies ──
    current_policy: normalized.merged_policy,
    proposed_policy: emptyPolicy(),
    applied_policy: null,
    policy_version: 1,
    policy_history: [],

    // ── AI-Generated Content (empty stubs — enrichment fills these) ──
    intent_summary: '',
    actual_permissions_summary: '',
    intent_gap: '',
    abuse_scenario: '',
    ai_confidence_score: 0,
    ai_confidence_note: null,

    // ── Simulation Results (empty — Stage 4 fills these) ──
    simulation_result: null,
    simulation_actions_removed: [],
    simulation_actions_preserved: [],
    simulation_breaking_changes: [],

    // ── Blast Radius (empty — enrichment fills this) ──
    blast_radius: {
      reachable_services: detection.services_before,
      critical_paths: [],
      risk_level: detection.risk_level,
    },

    // ── Terraform Export (empty — enrichment fills this) ──
    terraform_export: '',

    // ── Timestamps ──
    scan_created_at: scanCreatedAt,
    last_updated_at: now,
    enrichment_completed_at: null,
    simulation_completed_at: null,
    reviewed_at: null,
    applied_at: null,
    rolled_back_at: null,

    // ── Review ──
    reviewed_by: null,
    review_notes: null,
    alert_sent: false,
  };

  // Write finding to DynamoDB
  await repos.findings.put(finding);

  // Push enrichment job to SQS
  const enrichmentMessage: EnrichmentJobMessage = {
    scan_id: scanId,
    role_id: rawRole.role_arn,
    account_id: rawRole.account_id,
  };
  await sendMessage(enrichmentQueueUrl, enrichmentMessage);

  console.log(
    `[scanner] Processed role ${rawRole.role_name} — ` +
    `risk: ${detection.risk_level} (score: ${detection.risk_score}), ` +
    `wildcards: ${detection.wildcard_actions.length}, ` +
    `unused: ${detection.unused_services.length}`
  );
}

// ─── Scan Record Helpers ──────────────────────────────────────────────────────

async function ensureScanRecord(
  scan_id: string,
  account_id: string,
  account_name: string
): Promise<void> {
  const repos = getRepositories();
  const existing = await repos.scans.get(scan_id);
  if (existing) return;

  // Create scan record — coordinator should have done this, but be defensive
  const scan: IamScan = {
    scan_id,
    account_id,
    account_name,
    scan_status: 'IN_PROGRESS',
    total_roles_scanned: 0,
    high_risk_count: 0,
    medium_risk_count: 0,
    low_risk_count: 0,
    health_score: 0,
    triggered_by: 'SCHEDULED',
    scan_started_at: new Date().toISOString(),
    scan_completed_at: null,
    executive_report: null,
    report_generated_at: null,
  };

  await repos.scans.put(scan);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyPolicy(): PolicyDocument {
  return { Version: '2012-10-17', Statement: [] };
}
