/**
 * IAM Drift Intelligence — Dashboard Controller
 *
 * Aggregates metrics across all findings for the dashboard overview
 * and health score time-series for the trend chart.
 */

import { getRepositories } from '../repositories';
import { DashboardMetrics, HealthScoreEntry } from '../types';

// ─── Metrics ──────────────────────────────────────────────────────────────────

export async function getDashboardMetrics(): Promise<DashboardMetrics | null> {
  const repos = getRepositories();

  const [latestScan, findings] = await Promise.all([
    repos.scans.getLatest(),
    repos.findings.list(),
  ]);

  if (!latestScan) return null;

  const account = await repos.accounts.get(latestScan.account_id);
  if (!account) return null;

  const pendingReview = findings.filter((f) => f.review_decision === 'PENDING').length;
  const approvedCount = findings.filter((f) => f.review_decision === 'APPROVED').length;
  const rejectedCount = findings.filter((f) => f.review_decision === 'REJECTED').length;
  const appliedCount = findings.filter((f) => f.workflow_state === 'applied').length;

  // avg permission_reduction_pct across APPROVED + applied findings (decisions already made)
  const remediatedFindings = findings.filter(
    (f) => f.review_decision === 'APPROVED' || f.workflow_state === 'applied'
  );
  const avgPermissionReductionPct =
    remediatedFindings.length > 0
      ? Math.round(
          (remediatedFindings.reduce((sum, f) => sum + f.permission_reduction_pct, 0) /
            remediatedFindings.length) *
            10
        ) / 10
      : 0;

  // Wildcard actions before = sum of wildcard_actions.length across ALL findings
  const totalWildcardActionsBefore = findings.reduce(
    (sum, f) => sum + f.wildcard_actions.length,
    0
  );

  // Wildcard actions after = sum for non-APPROVED/non-applied findings only
  // (APPROVED/applied are assumed to have wildcards removed by the proposed policy)
  const totalWildcardActionsAfter = findings
    .filter((f) => f.review_decision !== 'APPROVED' && f.workflow_state !== 'applied')
    .reduce((sum, f) => sum + f.wildcard_actions.length, 0);

  const riskDistribution = {
    CRITICAL: findings.filter((f) => f.risk_level === 'CRITICAL').length,
    HIGH: findings.filter((f) => f.risk_level === 'HIGH').length,
    MEDIUM: findings.filter((f) => f.risk_level === 'MEDIUM').length,
    LOW: findings.filter((f) => f.risk_level === 'LOW').length,
  };

  return {
    account,
    latest_scan: latestScan,
    total_findings: findings.length,
    pending_review: pendingReview,
    approved_count: approvedCount,
    rejected_count: rejectedCount,
    applied_count: appliedCount,
    avg_permission_reduction_pct: avgPermissionReductionPct,
    total_wildcard_actions_before: totalWildcardActionsBefore,
    total_wildcard_actions_after: totalWildcardActionsAfter,
    risk_distribution: riskDistribution,
  };
}

// ─── Health History ───────────────────────────────────────────────────────────

export async function getHealthHistory(
  accountId?: string
): Promise<{ account_id: string; account_name: string; history: HealthScoreEntry[] } | null> {
  const repos = getRepositories();

  let targetAccountId = accountId;
  if (!targetAccountId) {
    const latestScan = await repos.scans.getLatest();
    if (!latestScan) return null;
    targetAccountId = latestScan.account_id;
  }

  const account = await repos.accounts.get(targetAccountId);
  if (!account) return null;

  return {
    account_id: targetAccountId,
    account_name: account.account_name,
    history: account.health_score_history,
  };
}
