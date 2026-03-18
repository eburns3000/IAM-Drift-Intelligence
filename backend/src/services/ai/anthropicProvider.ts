/**
 * IAM Drift Intelligence — Anthropic Claude Provider
 *
 * Implements AIProvider using the Anthropic API directly.
 * Swap path: implement BedrockProvider, set AI_PROVIDER=bedrock.
 *
 * Model: claude-sonnet-4-20250514
 * All responses are strict JSON — no markdown, no preamble.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  AIProvider,
  RemediationBundleInput,
  RemediationBundleOutput,
  ExecutiveSummaryInput,
  ExecutiveSummaryOutput,
} from './types';
import { PolicyDocument } from '../../types';

// ─── System Prompts ───────────────────────────────────────────────────────────

const REMEDIATION_SYSTEM_PROMPT = `You are an expert AWS IAM security engineer specializing in least-privilege access control and cloud security governance.

Your task: analyze over-privileged IAM roles and generate precise least-privilege remediation packages.

You respond ONLY with valid JSON. No explanation, no markdown, no preamble — pure JSON only.

Rules for proposed_policy generation:
1. Remove all permissions for unused services (>90 days with no CloudTrail activity)
2. Replace wildcard actions (service:*) with the specific actions this role actually needs, inferred from role name, function, and CloudTrail evidence
3. Replace wildcard resources (*) with specific ARNs where identifiable from context
4. Preserve the Version field as "2012-10-17"
5. Use descriptive Sid values that explain what each statement permits
6. Never remove permissions for actions that are clearly core to the role's function
7. If the role's intent is unclear (legacy/orphaned/ambiguous), set confidence_score below 0.75 and explain in confidence_note
8. The proposed_policy must be a valid AWS IAM policy document — it will be passed directly to SimulatePrincipalPolicy`;

const EXECUTIVE_SYSTEM_PROMPT = `You are a cloud security executive generating board-level security posture reports.

You respond ONLY with valid JSON. No explanation, no markdown, no preamble — pure JSON only.

Your reports are:
- Written for executives who understand business risk, not technical implementation
- Focused on risk quantification, business impact, and remediation progress
- Concise: each section is 2-4 sentences or a short bulleted list
- Action-oriented: every risk section ends with a clear recommendation`;

// ─── AnthropicProvider ────────────────────────────────────────────────────────

export class AnthropicProvider implements AIProvider {
  readonly providerName = 'anthropic';
  readonly modelId: string;

  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.modelId = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
  }

  async generateRemediationBundle(
    input: RemediationBundleInput
  ): Promise<RemediationBundleOutput> {
    const { finding, cloudtrail_evidence } = input;

    const evidenceSummary = cloudtrail_evidence
      ? cloudtrail_evidence.summary
      : 'No CloudTrail data available. Base the proposed policy on role name, current permissions, and IAM service last-accessed data only.';

    const prompt = `Analyze this IAM role and generate a complete remediation package.

=== ROLE DETAILS ===
Role Name: ${finding.role_name}
Role ARN: ${finding.role_arn}
Account: ${finding.account_id}
Last Role Used: ${finding.last_used_date ?? 'Never (no recorded usage)'}

=== CURRENT POLICY ===
${JSON.stringify(finding.current_policy, null, 2)}

=== SECURITY FINDINGS ===
- Wildcard Actions: ${finding.wildcard_actions.length > 0 ? finding.wildcard_actions.join(', ') : 'None'}
- Wildcard Resources (*): ${finding.wildcard_resources.length > 0 ? 'Yes — ' + finding.wildcard_resources.join(', ') : 'No'}
- Unused Services (90+ days inactive): ${finding.unused_services.length > 0 ? finding.unused_services.join(', ') : 'None detected'}
- Risk Score: ${finding.risk_score} / Risk Level: ${finding.risk_level}

=== CLOUDTRAIL EVIDENCE ===
${evidenceSummary}

Output this exact JSON structure (no markdown, no explanation):
{
  "intent_summary": "1-2 sentences describing what this role is INTENDED to do based on its name and actual usage",
  "actual_permissions_summary": "1-2 sentences describing what this role CAN actually do with its current policy",
  "intent_gap": "2-3 sentences analyzing the security gap between the intended purpose and the over-broad permissions granted",
  "abuse_scenario": "2-3 sentences describing a realistic attack scenario where an adversary exploits the over-permissions",
  "proposed_policy": { /* valid AWS IAM PolicyDocument */ },
  "services_after": ["service1", "service2"],
  "confidence_score": 0.0,
  "confidence_note": "explanation if confidence < 0.8, otherwise null"
}`;

    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: 4096,
      system: REMEDIATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = extractText(response.content);
    const parsed = parseJsonResponse<RemediationBundleOutput>(rawText);

    // Validate and normalise the proposed_policy
    const proposedPolicy = normalizePolicy(parsed.proposed_policy);

    return {
      intent_summary: parsed.intent_summary ?? '',
      actual_permissions_summary: parsed.actual_permissions_summary ?? '',
      intent_gap: parsed.intent_gap ?? '',
      abuse_scenario: parsed.abuse_scenario ?? '',
      proposed_policy: proposedPolicy,
      services_after: Array.isArray(parsed.services_after) ? parsed.services_after : [],
      confidence_score: clamp(Number(parsed.confidence_score ?? 0), 0, 1),
      confidence_note: parsed.confidence_note ?? null,
    };
  }

  async generateExecutiveSummary(
    input: ExecutiveSummaryInput
  ): Promise<ExecutiveSummaryOutput> {
    const { scan, findings, account_name } = input;

    const applied = findings.filter((f) => f.workflow_state === 'applied').length;
    const approved = findings.filter((f) => f.review_decision === 'APPROVED' && f.workflow_state !== 'applied').length;
    const pending = findings.filter((f) => f.review_decision === 'PENDING').length;
    const rejected = findings.filter((f) => f.review_decision === 'REJECTED').length;

    const avgReduction =
      findings.filter((f) => f.permission_reduction_pct > 0).length > 0
        ? Math.round(
            findings
              .filter((f) => f.permission_reduction_pct > 0)
              .reduce((s, f) => s + f.permission_reduction_pct, 0) /
              findings.filter((f) => f.permission_reduction_pct > 0).length
          )
        : 0;

    const highRiskRoles = findings
      .filter((f) => f.risk_level === 'HIGH' || f.risk_level === 'CRITICAL')
      .slice(0, 5)
      .map((f) => `${f.role_name} (score: ${f.risk_score}, wildcards: ${f.wildcard_actions.join(', ') || 'none'})`)
      .join('\n');

    const prompt = `Generate an executive security posture report for the following IAM scan results.

=== SCAN OVERVIEW ===
Account: ${account_name} (${scan.account_id})
Scan Date: ${scan.scan_started_at}
Total Roles Scanned: ${scan.total_roles_scanned}
Account IAM Health Score: ${scan.health_score}/100

=== RISK DISTRIBUTION ===
HIGH Risk Roles: ${scan.high_risk_count}
MEDIUM Risk Roles: ${scan.medium_risk_count}
LOW Risk Roles: ${scan.low_risk_count}

=== TOP HIGH-RISK FINDINGS ===
${highRiskRoles || 'No high-risk findings'}

=== REMEDIATION PROGRESS ===
Applied (live): ${applied} roles
Approved (pending apply): ${approved} roles
Pending Review: ${pending} roles
Rejected: ${rejected} roles
Average permission reduction: ${avgReduction}%

Output this exact JSON structure (no markdown, no explanation):
{
  "executive_summary": "3-4 paragraph board-level assessment of the account's IAM security posture",
  "key_findings": "Bullet-point summary of the most critical security findings (use \\n for line breaks)",
  "remediation_progress": "2-3 sentences summarizing remediation actions taken and outstanding",
  "risk_trends": "2-3 sentences on security posture trends and what the health score indicates",
  "recommendations": "Top 3-5 prioritized, actionable security recommendations (use \\n for line breaks)"
}`;

    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: 2048,
      system: EXECUTIVE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = extractText(response.content);
    return parseJsonResponse<ExecutiveSummaryOutput>(rawText);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function parseJsonResponse<T>(raw: string): T {
  // Strip any accidental markdown code fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(
      `AI provider returned invalid JSON. Parse error: ${err}. Raw response (first 500 chars): ${cleaned.slice(0, 500)}`
    );
  }
}

function normalizePolicy(raw: unknown): PolicyDocument {
  if (!raw || typeof raw !== 'object') {
    return { Version: '2012-10-17', Statement: [] };
  }
  const doc = raw as Record<string, unknown>;
  const stmts = Array.isArray(doc.Statement) ? doc.Statement : [];
  return {
    Version: '2012-10-17',
    Statement: stmts.map((s: unknown) => {
      const stmt = s as Record<string, unknown>;
      return {
        ...(stmt.Sid ? { Sid: String(stmt.Sid) } : {}),
        Effect: String(stmt.Effect ?? 'Allow') as 'Allow' | 'Deny',
        Action: toArray(stmt.Action),
        Resource: toArray(stmt.Resource),
        ...(stmt.Condition ? { Condition: stmt.Condition as Record<string, unknown> } : {}),
      };
    }),
  };
}

function toArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  return [String(v)];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
