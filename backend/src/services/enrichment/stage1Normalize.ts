/**
 * IAM Drift Intelligence — Enrichment Stage 1: Normalize
 *
 * Purpose:
 *   Gate and transition the finding into the enrichment phase.
 *   Verifies deterministic fields are populated (scanner completed successfully),
 *   then advances the workflow state to signal AI enrichment has begun.
 *
 * DynamoDB writes:
 *   - workflow_state: 'ai_enrichment_in_progress'
 *   - ai_status: 'IN_PROGRESS'
 *   - finding_status: 'AI_ENRICHMENT_IN_PROGRESS'
 *   - last_updated_at
 *
 * Failure behavior:
 *   If the finding is in an unexpected state, marks finding_status: 'ERROR'
 *   and returns success: false. Downstream stages will be skipped by the
 *   controller when the finding is in ERROR state.
 */

import { EnrichmentContext, StageResult } from './types';
import { IamFinding } from '../../types';

export async function runStage1(ctx: EnrichmentContext): Promise<StageResult> {
  const { finding } = ctx;
  const now = new Date().toISOString();

  // Gate: scanner must have written deterministic fields
  const validPriorStates: IamFinding['finding_status'][] = [
    'DETERMINISTIC_COMPLETE',
    'AI_ENRICHMENT_IN_PROGRESS', // allow re-run on partial failures
  ];

  if (!validPriorStates.includes(finding.finding_status)) {
    return {
      stage: 1,
      success: false,
      error: `Stage 1 gate: unexpected finding_status '${finding.finding_status}' — expected DETERMINISTIC_COMPLETE`,
      updates: {
        finding_status: 'ERROR',
        last_updated_at: now,
      },
    };
  }

  if (!finding.current_policy || finding.current_policy.Statement.length === 0) {
    return {
      stage: 1,
      success: false,
      error: 'Stage 1 gate: current_policy is empty — scanner may not have completed correctly',
      updates: {
        finding_status: 'ERROR',
        last_updated_at: now,
      },
    };
  }

  const updates: Partial<IamFinding> = {
    finding_status: 'AI_ENRICHMENT_IN_PROGRESS',
    workflow_state: 'ai_enrichment_in_progress',
    ai_status: 'IN_PROGRESS',
    last_updated_at: now,
  };

  return { stage: 1, success: true, updates };
}
