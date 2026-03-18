/**
 * IAM Drift Intelligence — Repository Interfaces
 *
 * Storage-agnostic contracts for all three DynamoDB tables.
 * DynamoDB and in-memory implementations both satisfy these interfaces.
 *
 * Access patterns covered:
 *
 * Findings (PK: scan_id, SK: role_id)
 *   - get by composite key (scan_id + role_id)
 *   - list all
 *   - query by scan_id (all findings for a scan)
 *   - query by review_decision GSI
 *   - query by risk_level GSI
 *   - query by account_id GSI
 *   - put / update (workflow state transitions)
 *
 * Scans (PK: scan_id)
 *   - get / list / put / update
 *   - list sorted by date (for history view)
 *
 * Accounts (PK: account_id)
 *   - get / put / update
 *   - health score history append
 */

import {
  IamFinding,
  IamScan,
  IamAccount,
  ReviewDecision,
  RiskLevel,
  ReviewDecisionUpdate,
} from '../types';

// ─── Findings Repository ──────────────────────────────────────────────────────

export interface FindingsRepository {
  get(scan_id: string, role_id: string): Promise<IamFinding | undefined>;
  getByRoleId(role_id: string): Promise<IamFinding[]>;
  list(): Promise<IamFinding[]>;
  listByScanId(scan_id: string): Promise<IamFinding[]>;
  listByReviewDecision(decision: ReviewDecision): Promise<IamFinding[]>;
  listByRiskLevel(level: RiskLevel): Promise<IamFinding[]>;
  listByAccountId(account_id: string): Promise<IamFinding[]>;
  put(item: IamFinding): Promise<IamFinding>;
  update(
    scan_id: string,
    role_id: string,
    updates: Partial<IamFinding>
  ): Promise<IamFinding | undefined>;
  applyDecision(
    scan_id: string,
    role_id: string,
    decision: ReviewDecisionUpdate
  ): Promise<IamFinding | undefined>;
  count(): Promise<number>;
}

// ─── Scans Repository ─────────────────────────────────────────────────────────

export interface ScansRepository {
  get(scan_id: string): Promise<IamScan | undefined>;
  list(): Promise<IamScan[]>;
  getLatest(): Promise<IamScan | undefined>;
  put(item: IamScan): Promise<IamScan>;
  update(scan_id: string, updates: Partial<IamScan>): Promise<IamScan | undefined>;
  count(): Promise<number>;
}

// ─── Accounts Repository ──────────────────────────────────────────────────────

export interface AccountsRepository {
  get(account_id: string): Promise<IamAccount | undefined>;
  list(): Promise<IamAccount[]>;
  put(item: IamAccount): Promise<IamAccount>;
  update(account_id: string, updates: Partial<IamAccount>): Promise<IamAccount | undefined>;
}

// ─── Aggregate Repository ─────────────────────────────────────────────────────

export interface Repositories {
  findings: FindingsRepository;
  scans: ScansRepository;
  accounts: AccountsRepository;
}
