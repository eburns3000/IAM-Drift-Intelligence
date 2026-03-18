/**
 * IAM Drift Intelligence — In-Memory Repository Implementation
 *
 * Used when STORAGE_BACKEND=memory (default for local dev without Docker).
 * Initializes automatically with TechCorp seed data.
 * No AWS credentials or DynamoDB Local required.
 */

import { IamFinding, IamScan, IamAccount, ReviewDecision, RiskLevel, ReviewDecisionUpdate } from '../types';
import { seedFindings, seedScan, seedAccount } from '../data/seed';
import {
  FindingsRepository,
  ScansRepository,
  AccountsRepository,
  Repositories,
} from './interfaces';

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const store = {
  findings: new Map<string, IamFinding>(),   // key: scan_id#role_id
  scans: new Map<string, IamScan>(),          // key: scan_id
  accounts: new Map<string, IamAccount>(),   // key: account_id
};

function findingKey(scan_id: string, role_id: string): string {
  return `${scan_id}#${role_id}`;
}

function initStore(): void {
  if (store.findings.size > 0) return; // already initialized
  for (const f of seedFindings) {
    store.findings.set(findingKey(f.scan_id, f.role_id), { ...f });
  }
  store.scans.set(seedScan.scan_id, { ...seedScan });
  store.accounts.set(seedAccount.account_id, { ...seedAccount });
}

initStore();

// ─── Findings ─────────────────────────────────────────────────────────────────

class InMemoryFindingsRepository implements FindingsRepository {
  async get(scan_id: string, role_id: string): Promise<IamFinding | undefined> {
    return store.findings.get(findingKey(scan_id, role_id));
  }

  async getByRoleId(role_id: string): Promise<IamFinding[]> {
    return Array.from(store.findings.values()).filter((f) => f.role_id === role_id);
  }

  async list(): Promise<IamFinding[]> {
    return Array.from(store.findings.values());
  }

  async listByScanId(scan_id: string): Promise<IamFinding[]> {
    return Array.from(store.findings.values()).filter((f) => f.scan_id === scan_id);
  }

  async listByReviewDecision(decision: ReviewDecision): Promise<IamFinding[]> {
    return Array.from(store.findings.values()).filter((f) => f.review_decision === decision);
  }

  async listByRiskLevel(level: RiskLevel): Promise<IamFinding[]> {
    return Array.from(store.findings.values()).filter((f) => f.risk_level === level);
  }

  async listByAccountId(account_id: string): Promise<IamFinding[]> {
    return Array.from(store.findings.values()).filter((f) => f.account_id === account_id);
  }

  async put(item: IamFinding): Promise<IamFinding> {
    store.findings.set(findingKey(item.scan_id, item.role_id), { ...item });
    return item;
  }

  async update(
    scan_id: string,
    role_id: string,
    updates: Partial<IamFinding>
  ): Promise<IamFinding | undefined> {
    const existing = store.findings.get(findingKey(scan_id, role_id));
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    store.findings.set(findingKey(scan_id, role_id), updated);
    return updated;
  }

  async applyDecision(
    scan_id: string,
    role_id: string,
    decision: ReviewDecisionUpdate
  ): Promise<IamFinding | undefined> {
    const now = new Date().toISOString();
    return this.update(scan_id, role_id, {
      review_decision: decision.review_decision,
      reviewed_by: decision.reviewed_by,
      review_notes: decision.review_notes ?? null,
      reviewed_at: now,
      last_updated_at: now,
      workflow_state: decision.review_decision === 'APPROVED' ? 'approved' : 'rejected',
      next_action_required:
        decision.review_decision === 'APPROVED' ? 'safe_to_apply' : 'reviewer_decision_needed',
    });
  }

  async count(): Promise<number> {
    return store.findings.size;
  }
}

// ─── Scans ────────────────────────────────────────────────────────────────────

class InMemoryScansRepository implements ScansRepository {
  async get(scan_id: string): Promise<IamScan | undefined> {
    return store.scans.get(scan_id);
  }

  async list(): Promise<IamScan[]> {
    return Array.from(store.scans.values()).sort((a, b) =>
      b.scan_started_at.localeCompare(a.scan_started_at)
    );
  }

  async getLatest(): Promise<IamScan | undefined> {
    const all = await this.list();
    return all[0];
  }

  async put(item: IamScan): Promise<IamScan> {
    store.scans.set(item.scan_id, { ...item });
    return item;
  }

  async update(scan_id: string, updates: Partial<IamScan>): Promise<IamScan | undefined> {
    const existing = store.scans.get(scan_id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    store.scans.set(scan_id, updated);
    return updated;
  }

  async count(): Promise<number> {
    return store.scans.size;
  }
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

class InMemoryAccountsRepository implements AccountsRepository {
  async get(account_id: string): Promise<IamAccount | undefined> {
    return store.accounts.get(account_id);
  }

  async list(): Promise<IamAccount[]> {
    return Array.from(store.accounts.values());
  }

  async put(item: IamAccount): Promise<IamAccount> {
    store.accounts.set(item.account_id, { ...item });
    return item;
  }

  async update(account_id: string, updates: Partial<IamAccount>): Promise<IamAccount | undefined> {
    const existing = store.accounts.get(account_id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    store.accounts.set(account_id, updated);
    return updated;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createInMemoryRepositories(): Repositories {
  return {
    findings: new InMemoryFindingsRepository(),
    scans: new InMemoryScansRepository(),
    accounts: new InMemoryAccountsRepository(),
  };
}
