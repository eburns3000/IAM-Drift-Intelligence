/**
 * IAM Drift Intelligence — Core Type Definitions
 *
 * All domain types for the IAM governance platform.
 * These types mirror the DynamoDB item model exactly.
 */

// ─── Enums / Union Types ──────────────────────────────────────────────────────

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FindingStatus =
  | 'SCANNING'
  | 'DETERMINISTIC_COMPLETE'
  | 'AI_ENRICHMENT_IN_PROGRESS'
  | 'READY'
  | 'ERROR';

export type AIStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';

export type SimulationStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED' | 'SKIPPED';

export type WorkflowState =
  | 'scan_requested'
  | 'scanning'
  | 'deterministic_complete'
  | 'ai_enrichment_in_progress'
  | 'simulation_complete'
  | 'ready_for_review'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'rolled_back';

export type ReviewDecision = 'PENDING' | 'APPROVED' | 'REJECTED';

export type NextActionRequired =
  | 'waiting_for_simulation'
  | 'ready_for_review'
  | 'reviewer_decision_needed'
  | 'safe_to_apply'
  | 'rollback_available';

export type SimulationResult = 'PASS' | 'FAIL' | 'PARTIAL';

export type ScanStatus = 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';

export type ScanTrigger = 'SCHEDULED' | 'MANUAL';

// ─── IAM Policy Types ─────────────────────────────────────────────────────────

export interface PolicyStatement {
  Sid?: string;
  Effect: 'Allow' | 'Deny';
  Action: string | string[];
  Resource: string | string[];
  Condition?: Record<string, unknown>;
}

export interface PolicyDocument {
  Version: string;
  Statement: PolicyStatement[];
}

export interface PolicyHistoryEntry {
  version: number;
  policy: PolicyDocument;
  changed_at: string;
  changed_by: string;
  change_reason: string;
}

// ─── Blast Radius ─────────────────────────────────────────────────────────────

export interface BlastRadius {
  reachable_services: string[];
  critical_paths: string[];
  risk_level: RiskLevel;
}

// ─── iam-drift-findings Table ─────────────────────────────────────────────────
// PK: scan_id  SK: role_id
// GSIs: review_decision-index, risk_level-index, account_id-index

export interface IamFinding {
  // ── Keys ──
  scan_id: string;
  role_id: string; // ARN used as SK

  // ── Role Identity ──
  account_id: string;
  role_name: string;
  role_arn: string;

  // ── Workflow State ──
  finding_status: FindingStatus;
  ai_status: AIStatus;
  simulation_status: SimulationStatus;
  workflow_state: WorkflowState;
  next_action_required: NextActionRequired;
  review_decision: ReviewDecision;

  // ── Risk Assessment (deterministic) ──
  risk_score: number;
  risk_level: RiskLevel;
  wildcard_actions: string[];
  wildcard_resources: string[];
  unused_services: string[];
  last_used_date: string | null;

  // ── Permission Metrics ──
  permission_count_before: number;
  permission_count_after: number;
  permission_reduction_pct: number;
  services_before: string[];
  services_after: string[];

  // ── Policies ──
  current_policy: PolicyDocument;
  proposed_policy: PolicyDocument;
  applied_policy: PolicyDocument | null;
  policy_version: number;
  policy_history: PolicyHistoryEntry[];

  // ── AI-Generated Content ──
  intent_summary: string;
  actual_permissions_summary: string;
  intent_gap: string;
  abuse_scenario: string;
  ai_confidence_score: number;
  ai_confidence_note: string | null;

  // ── Simulation Results ──
  simulation_result: SimulationResult | null;
  simulation_actions_removed: string[];
  simulation_actions_preserved: string[];
  simulation_breaking_changes: string[];

  // ── Blast Radius ──
  blast_radius: BlastRadius;

  // ── Terraform Export ──
  terraform_export: string;

  // ── Timestamps ──
  scan_created_at: string;
  last_updated_at: string;
  enrichment_completed_at: string | null;
  simulation_completed_at: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  rolled_back_at: string | null;

  // ── Review ──
  reviewed_by: string | null;
  review_notes: string | null;
  alert_sent: boolean;
}

// ─── iam-drift-scans Table ────────────────────────────────────────────────────
// PK: scan_id

export interface IamScan {
  scan_id: string;
  account_id: string;
  account_name: string;
  scan_status: ScanStatus;
  total_roles_scanned: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  health_score: number;
  triggered_by: ScanTrigger;
  scan_started_at: string;
  scan_completed_at: string | null;
  executive_report: string | null;
  report_generated_at: string | null;
}

// ─── iam-drift-accounts Table ─────────────────────────────────────────────────
// PK: account_id

export interface HealthScoreEntry {
  scan_id: string;
  score: number;
  recorded_at: string;
}

export interface IamAccount {
  account_id: string;
  account_name: string;
  account_alias: string;
  health_score: number;
  health_score_history: HealthScoreEntry[];
  last_scanned_at: string;
  total_roles: number;
  high_risk_roles: number;
  medium_risk_roles: number;
  low_risk_roles: number;
}

// ─── API Response Shapes ──────────────────────────────────────────────────────

export interface DashboardMetrics {
  account: IamAccount;
  latest_scan: IamScan;
  total_findings: number;
  pending_review: number;
  approved_count: number;
  rejected_count: number;
  applied_count: number;
  /** avg permission_reduction_pct across APPROVED/applied findings */
  avg_permission_reduction_pct: number;
  /** sum of wildcard_actions.length across ALL findings (before remediation) */
  total_wildcard_actions_before: number;
  /** sum of wildcard_actions.length for non-APPROVED/non-applied findings (after) */
  total_wildcard_actions_after: number;
  risk_distribution: {
    HIGH: number;
    MEDIUM: number;
    LOW: number;
    CRITICAL: number;
  };
}

export interface ReviewDecisionUpdate {
  review_decision: ReviewDecision;
  reviewed_by: string;
  review_notes?: string;
}
