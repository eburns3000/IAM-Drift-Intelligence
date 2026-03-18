/**
 * IAM Drift Intelligence — AI Provider Interface
 *
 * Model-agnostic contract for all AI operations. AnthropicProvider implements
 * this today; a BedrockProvider can be swapped in via AI_PROVIDER=bedrock
 * without changing any handler or controller code.
 *
 * Design rule: AI enriches findings — AI never detects issues.
 * All detection is deterministic and lives in the scanner detector.
 */

import { IamFinding, IamScan, PolicyDocument } from '../../types';

// ─── generateRemediationBundle ────────────────────────────────────────────────
// One AI call that generates everything needed to enrich a finding.
// Combining policy gen + intent gap + abuse scenario into a single call
// reduces latency and token usage vs. three separate calls.

export interface RemediationBundleInput {
  finding: IamFinding;
  /** Optional: CloudTrail action evidence from Stage 2 */
  cloudtrail_evidence: CloudTrailEvidence | null;
}

export interface RemediationBundleOutput {
  intent_summary: string;
  actual_permissions_summary: string;
  intent_gap: string;
  abuse_scenario: string;
  proposed_policy: PolicyDocument;
  services_after: string[];
  confidence_score: number;
  confidence_note: string | null;
}

// ─── generateExecutiveSummary ─────────────────────────────────────────────────

export interface ExecutiveSummaryInput {
  scan: IamScan;
  findings: IamFinding[];
  account_name: string;
}

export interface ExecutiveSummaryOutput {
  executive_summary: string;
  key_findings: string;
  remediation_progress: string;
  risk_trends: string;
  recommendations: string;
}

// ─── CloudTrail Evidence (passed between Stage 2 → Stage 3) ──────────────────

export interface CloudTrailEvidence {
  /** Services that have been called by this role (from CloudTrail) */
  observed_services: string[];
  /** Specific actions called by this role in last 90 days */
  observed_actions: string[];
  /** Summary string passed verbatim to the AI prompt */
  summary: string;
}

// ─── AIProvider Interface ─────────────────────────────────────────────────────

export interface AIProvider {
  readonly providerName: string;
  readonly modelId: string;

  /**
   * Generates the complete AI enrichment bundle for a finding:
   * proposed policy, intent gap analysis, abuse scenario, confidence score.
   * One API call per finding.
   */
  generateRemediationBundle(
    input: RemediationBundleInput
  ): Promise<RemediationBundleOutput>;

  /**
   * Generates a board-level executive summary for a completed scan.
   */
  generateExecutiveSummary(
    input: ExecutiveSummaryInput
  ): Promise<ExecutiveSummaryOutput>;
}
