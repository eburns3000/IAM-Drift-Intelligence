/**
 * IAM Drift Intelligence — Enrichment Stage 3: AI Policy Generation
 *
 * Purpose:
 *   The AI enrichment core. Calls Claude to generate the complete remediation bundle:
 *   - Proposed least-privilege policy (JSON)
 *   - Intent summary (what the role should do)
 *   - Actual permissions summary (what it can do)
 *   - Intent gap (the security delta)
 *   - Abuse scenario (adversarial impact)
 *   - Confidence score + note
 *
 * Design rule: AI enriches — never detects.
 * The proposed_policy is based on AI inference from role name, current policy,
 * and CloudTrail evidence passed from Stage 2.
 *
 * DynamoDB writes:
 *   - proposed_policy
 *   - intent_summary, actual_permissions_summary, intent_gap, abuse_scenario
 *   - ai_confidence_score, ai_confidence_note
 *   - ai_status: 'COMPLETE' (or 'FAILED' on error)
 *   - last_updated_at
 *
 * Failure behavior:
 *   If the AI call fails, ai_status is set to FAILED. Stage 4 (simulator)
 *   will skip because it requires a valid proposed_policy.
 *   The finding is still written to DynamoDB and surfaced in the UI
 *   with the AI fields empty and ai_status: FAILED.
 */

import { EnrichmentContext, StageResult } from './types';
import { IamFinding } from '../../types';
import { getAIProvider } from '../ai';

export async function runStage3(ctx: EnrichmentContext): Promise<StageResult> {
  const { finding, cloudtrail_evidence } = ctx;
  const now = new Date().toISOString();

  let updates: Partial<IamFinding>;

  try {
    const aiProvider = getAIProvider();

    console.log(
      `[stage3] Generating remediation bundle for ${finding.role_name} via ${aiProvider.providerName}`
    );

    const result = await aiProvider.generateRemediationBundle({
      finding,
      cloudtrail_evidence,
    });

    updates = {
      proposed_policy: result.proposed_policy,
      services_after: result.services_after,
      intent_summary: result.intent_summary,
      actual_permissions_summary: result.actual_permissions_summary,
      intent_gap: result.intent_gap,
      abuse_scenario: result.abuse_scenario,
      ai_confidence_score: result.confidence_score,
      ai_confidence_note: result.confidence_note,
      ai_status: 'COMPLETE',
      last_updated_at: now,
    };

    console.log(
      `[stage3] AI complete for ${finding.role_name} — ` +
      `confidence: ${result.confidence_score.toFixed(2)}, ` +
      `services_after: ${result.services_after.join(', ')}`
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[stage3] AI generation failed for ${finding.role_name}:`, errorMsg);

    updates = {
      ai_status: 'FAILED',
      ai_confidence_note: `AI generation failed: ${errorMsg.slice(0, 200)}`,
      last_updated_at: now,
    };

    return { stage: 3, success: false, error: errorMsg, updates };
  }

  return { stage: 3, success: true, updates };
}
