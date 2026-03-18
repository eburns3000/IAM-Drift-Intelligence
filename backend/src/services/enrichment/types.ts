/**
 * IAM Drift Intelligence — Enrichment Pipeline Types
 *
 * Data structures shared across the 5 enrichment stages.
 * The EnrichmentContext is created once per invocation and flows
 * through all stages, accumulating state without repeated DynamoDB reads.
 */

import { IamFinding } from '../../types';
import { CloudTrailEvidence } from '../ai/types';

// ─── Enrichment Context ───────────────────────────────────────────────────────

/**
 * Mutable context passed between all 5 enrichment stages.
 * Each stage reads the current finding state and may update it.
 * DynamoDB writes happen after each stage for durability.
 */
export interface EnrichmentContext {
  /** Current finding — updated in-memory as stages progress */
  finding: IamFinding;
  /** CloudTrail evidence collected in Stage 2 — passed to Stage 3 AI prompt */
  cloudtrail_evidence: CloudTrailEvidence | null;
}

// ─── Stage Result ─────────────────────────────────────────────────────────────

/**
 * Returned by every enrichment stage.
 * On success: updates are applied to ctx.finding and written to DynamoDB.
 * On failure: the stage is marked as failed but subsequent stages still run.
 */
export interface StageResult {
  stage: number;
  success: boolean;
  updates: Partial<IamFinding>;
  error?: string;
}
