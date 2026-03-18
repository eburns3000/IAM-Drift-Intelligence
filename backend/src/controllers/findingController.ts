/**
 * IAM Drift Intelligence — Finding Controller
 *
 * Business logic for finding-related API routes:
 *   - list (with optional filters: scan_id, review_decision, risk_level, account_id)
 *   - get by composite key (scan_id + role_id)
 *   - approve — gates on simulation_status === 'COMPLETE'
 *   - reject
 *   - rollback — restores current_policy from policy_history, increments policy_version
 */

import { getRepositories } from '../repositories';
import { IamFinding, ReviewDecision, RiskLevel } from '../types';

// ─── Shared Error Type ────────────────────────────────────────────────────────

export interface FindingError {
  code: 'NOT_FOUND' | 'SIMULATION_INCOMPLETE' | 'INVALID_STATE';
  message: string;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export interface FindingFilters {
  scan_id?: string;
  review_decision?: ReviewDecision;
  risk_level?: RiskLevel;
  account_id?: string;
}

export async function listFindings(filters: FindingFilters): Promise<IamFinding[]> {
  const repos = getRepositories();

  // Use most specific access pattern available
  if (filters.scan_id && filters.review_decision) {
    const all = await repos.findings.listByScanId(filters.scan_id);
    return all.filter((f) => f.review_decision === filters.review_decision);
  }
  if (filters.scan_id) return repos.findings.listByScanId(filters.scan_id);
  if (filters.review_decision) return repos.findings.listByReviewDecision(filters.review_decision);
  if (filters.risk_level) return repos.findings.listByRiskLevel(filters.risk_level);
  if (filters.account_id) return repos.findings.listByAccountId(filters.account_id);
  return repos.findings.list();
}

// ─── Get ──────────────────────────────────────────────────────────────────────

export async function getFinding(
  scanId: string,
  roleId: string
): Promise<IamFinding | undefined> {
  return getRepositories().findings.get(scanId, roleId);
}

// ─── Approve ──────────────────────────────────────────────────────────────────

export interface ApproveRequest {
  scan_id: string;
  reviewed_by: string;
  review_notes?: string;
}

export async function approveFinding(
  roleId: string,
  request: ApproveRequest
): Promise<{ finding?: IamFinding; error?: FindingError }> {
  const repos = getRepositories();
  const finding = await repos.findings.get(request.scan_id, roleId);

  if (!finding) {
    return { error: { code: 'NOT_FOUND', message: 'Finding not found' } };
  }

  // Gate: simulation must be complete before approval is permitted
  if (finding.simulation_status !== 'COMPLETE') {
    return {
      error: {
        code: 'SIMULATION_INCOMPLETE',
        message:
          `Simulation must be COMPLETE before approving. ` +
          `Current simulation_status: ${finding.simulation_status}`,
      },
    };
  }

  if (finding.review_decision !== 'PENDING') {
    return {
      error: {
        code: 'INVALID_STATE',
        message: `Finding has already been reviewed (decision: ${finding.review_decision})`,
      },
    };
  }

  const updated = await repos.findings.applyDecision(request.scan_id, roleId, {
    review_decision: 'APPROVED',
    reviewed_by: request.reviewed_by,
    review_notes: request.review_notes,
  });

  return { finding: updated };
}

// ─── Reject ───────────────────────────────────────────────────────────────────

export interface RejectRequest {
  scan_id: string;
  reviewed_by: string;
  review_notes?: string;
}

export async function rejectFinding(
  roleId: string,
  request: RejectRequest
): Promise<{ finding?: IamFinding; error?: FindingError }> {
  const repos = getRepositories();
  const finding = await repos.findings.get(request.scan_id, roleId);

  if (!finding) {
    return { error: { code: 'NOT_FOUND', message: 'Finding not found' } };
  }

  if (finding.review_decision !== 'PENDING') {
    return {
      error: {
        code: 'INVALID_STATE',
        message: `Finding has already been reviewed (decision: ${finding.review_decision})`,
      },
    };
  }

  const updated = await repos.findings.applyDecision(request.scan_id, roleId, {
    review_decision: 'REJECTED',
    reviewed_by: request.reviewed_by,
    review_notes: request.review_notes,
  });

  return { finding: updated };
}

// ─── Rollback ─────────────────────────────────────────────────────────────────

export interface RollbackRequest {
  scan_id: string;
  rolled_back_by: string;
}

export async function rollbackFinding(
  roleId: string,
  request: RollbackRequest
): Promise<{ finding?: IamFinding; error?: FindingError }> {
  const repos = getRepositories();
  const finding = await repos.findings.get(request.scan_id, roleId);

  if (!finding) {
    return { error: { code: 'NOT_FOUND', message: 'Finding not found' } };
  }

  if (!finding.applied_policy) {
    return {
      error: {
        code: 'INVALID_STATE',
        message: 'No applied policy found — nothing to roll back',
      },
    };
  }

  const now = new Date().toISOString();
  const newVersion = finding.policy_version + 1;

  // Restore from the most recent policy_history entry (pre-apply snapshot)
  const lastHistoryEntry =
    finding.policy_history.length > 0
      ? finding.policy_history[finding.policy_history.length - 1]
      : null;
  const restoredPolicy = lastHistoryEntry ? lastHistoryEntry.policy : finding.applied_policy;

  const updates: Partial<IamFinding> = {
    current_policy: restoredPolicy,
    applied_policy: null,
    workflow_state: 'rolled_back',
    rolled_back_at: now,
    last_updated_at: now,
    policy_version: newVersion,
    policy_history: [
      ...finding.policy_history,
      {
        version: newVersion,
        policy: restoredPolicy,
        changed_at: now,
        changed_by: request.rolled_back_by,
        change_reason: 'Policy rolled back via IAM Drift Intelligence',
      },
    ],
  };

  const updated = await repos.findings.update(request.scan_id, roleId, updates);
  return { finding: updated };
}
