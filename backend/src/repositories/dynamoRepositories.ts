/**
 * IAM Drift Intelligence — DynamoDB Repository Implementation
 *
 * Implements all repository interfaces against DynamoDB using
 * @aws-sdk/lib-dynamodb DocumentClient for automatic type marshalling.
 *
 * Table access patterns:
 *
 * iam-drift-findings (PK: scan_id, SK: role_id)
 *   GSIs: review_decision-index, risk_level-index, account_id-index
 *   - GetItem     → get by scan_id + role_id
 *   - Query PK    → all findings for a scan
 *   - Query GSI   → filter by decision / risk_level / account_id
 *   - Scan        → list all (small portfolio, acceptable)
 *   - PutItem     → create / replace
 *   - UpdateItem  → workflow state transitions
 *
 * iam-drift-scans (PK: scan_id)
 *   - GetItem / PutItem / UpdateItem / Scan
 *
 * iam-drift-accounts (PK: account_id)
 *   - GetItem / PutItem / UpdateItem / Scan
 */

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  ScanCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, FINDINGS_TABLE, SCANS_TABLE, ACCOUNTS_TABLE, buildUpdateExpression } from '../lib/dynamo';
import { IamFinding, IamScan, IamAccount, ReviewDecision, RiskLevel, ReviewDecisionUpdate } from '../types';
import {
  FindingsRepository,
  ScansRepository,
  AccountsRepository,
  Repositories,
} from './interfaces';

// ─── Findings Repository ──────────────────────────────────────────────────────

class DynamoFindingsRepository implements FindingsRepository {
  async get(scan_id: string, role_id: string): Promise<IamFinding | undefined> {
    const result = await docClient.send(
      new GetCommand({
        TableName: FINDINGS_TABLE(),
        Key: { scan_id, role_id },
      })
    );
    return result.Item as IamFinding | undefined;
  }

  async getByRoleId(role_id: string): Promise<IamFinding[]> {
    // Query GSI not available for SK directly — use account_id-index or scan
    // For role detail page: scan with filter (findings per role are few)
    const result = await docClient.send(
      new ScanCommand({
        TableName: FINDINGS_TABLE(),
        FilterExpression: '#role_id = :role_id',
        ExpressionAttributeNames: { '#role_id': 'role_id' },
        ExpressionAttributeValues: { ':role_id': role_id },
      })
    );
    return (result.Items ?? []) as IamFinding[];
  }

  async list(): Promise<IamFinding[]> {
    const result = await docClient.send(new ScanCommand({ TableName: FINDINGS_TABLE() }));
    return (result.Items ?? []) as IamFinding[];
  }

  async listByScanId(scan_id: string): Promise<IamFinding[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: FINDINGS_TABLE(),
        KeyConditionExpression: 'scan_id = :scan_id',
        ExpressionAttributeValues: { ':scan_id': scan_id },
      })
    );
    return (result.Items ?? []) as IamFinding[];
  }

  async listByReviewDecision(decision: ReviewDecision): Promise<IamFinding[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: FINDINGS_TABLE(),
        IndexName: 'review_decision-index',
        KeyConditionExpression: 'review_decision = :decision',
        ExpressionAttributeValues: { ':decision': decision },
      })
    );
    return (result.Items ?? []) as IamFinding[];
  }

  async listByRiskLevel(level: RiskLevel): Promise<IamFinding[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: FINDINGS_TABLE(),
        IndexName: 'risk_level-index',
        KeyConditionExpression: 'risk_level = :level',
        ExpressionAttributeValues: { ':level': level },
      })
    );
    return (result.Items ?? []) as IamFinding[];
  }

  async listByAccountId(account_id: string): Promise<IamFinding[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: FINDINGS_TABLE(),
        IndexName: 'account_id-index',
        KeyConditionExpression: 'account_id = :account_id',
        ExpressionAttributeValues: { ':account_id': account_id },
      })
    );
    return (result.Items ?? []) as IamFinding[];
  }

  async put(item: IamFinding): Promise<IamFinding> {
    await docClient.send(new PutCommand({ TableName: FINDINGS_TABLE(), Item: item }));
    return item;
  }

  async update(
    scan_id: string,
    role_id: string,
    updates: Partial<IamFinding>
  ): Promise<IamFinding | undefined> {
    const existing = await this.get(scan_id, role_id);
    if (!existing) return undefined;

    const expr = buildUpdateExpression(updates as Record<string, unknown>);
    const result = await docClient.send(
      new UpdateCommand({
        TableName: FINDINGS_TABLE(),
        Key: { scan_id, role_id },
        ...expr,
        ReturnValues: 'ALL_NEW',
      })
    );
    return result.Attributes as IamFinding | undefined;
  }

  async applyDecision(
    scan_id: string,
    role_id: string,
    decision: ReviewDecisionUpdate
  ): Promise<IamFinding | undefined> {
    const now = new Date().toISOString();
    const updates: Partial<IamFinding> = {
      review_decision: decision.review_decision,
      reviewed_by: decision.reviewed_by,
      review_notes: decision.review_notes ?? null,
      reviewed_at: now,
      last_updated_at: now,
      workflow_state: decision.review_decision === 'APPROVED' ? 'approved' : 'rejected',
      next_action_required:
        decision.review_decision === 'APPROVED' ? 'safe_to_apply' : 'reviewer_decision_needed',
    };
    return this.update(scan_id, role_id, updates);
  }

  async count(): Promise<number> {
    const result = await docClient.send(
      new ScanCommand({ TableName: FINDINGS_TABLE(), Select: 'COUNT' })
    );
    return result.Count ?? 0;
  }
}

// ─── Scans Repository ─────────────────────────────────────────────────────────

class DynamoScansRepository implements ScansRepository {
  async get(scan_id: string): Promise<IamScan | undefined> {
    const result = await docClient.send(
      new GetCommand({ TableName: SCANS_TABLE(), Key: { scan_id } })
    );
    return result.Item as IamScan | undefined;
  }

  async list(): Promise<IamScan[]> {
    const result = await docClient.send(new ScanCommand({ TableName: SCANS_TABLE() }));
    const items = (result.Items ?? []) as IamScan[];
    return items.sort((a, b) => b.scan_started_at.localeCompare(a.scan_started_at));
  }

  async getLatest(): Promise<IamScan | undefined> {
    const all = await this.list();
    return all[0];
  }

  async put(item: IamScan): Promise<IamScan> {
    await docClient.send(new PutCommand({ TableName: SCANS_TABLE(), Item: item }));
    return item;
  }

  async update(scan_id: string, updates: Partial<IamScan>): Promise<IamScan | undefined> {
    const existing = await this.get(scan_id);
    if (!existing) return undefined;

    const expr = buildUpdateExpression(updates as Record<string, unknown>);
    const result = await docClient.send(
      new UpdateCommand({
        TableName: SCANS_TABLE(),
        Key: { scan_id },
        ...expr,
        ReturnValues: 'ALL_NEW',
      })
    );
    return result.Attributes as IamScan | undefined;
  }

  async count(): Promise<number> {
    const result = await docClient.send(
      new ScanCommand({ TableName: SCANS_TABLE(), Select: 'COUNT' })
    );
    return result.Count ?? 0;
  }
}

// ─── Accounts Repository ──────────────────────────────────────────────────────

class DynamoAccountsRepository implements AccountsRepository {
  async get(account_id: string): Promise<IamAccount | undefined> {
    const result = await docClient.send(
      new GetCommand({ TableName: ACCOUNTS_TABLE(), Key: { account_id } })
    );
    return result.Item as IamAccount | undefined;
  }

  async list(): Promise<IamAccount[]> {
    const result = await docClient.send(new ScanCommand({ TableName: ACCOUNTS_TABLE() }));
    return (result.Items ?? []) as IamAccount[];
  }

  async put(item: IamAccount): Promise<IamAccount> {
    await docClient.send(new PutCommand({ TableName: ACCOUNTS_TABLE(), Item: item }));
    return item;
  }

  async update(account_id: string, updates: Partial<IamAccount>): Promise<IamAccount | undefined> {
    const existing = await this.get(account_id);
    if (!existing) return undefined;

    const expr = buildUpdateExpression(updates as Record<string, unknown>);
    const result = await docClient.send(
      new UpdateCommand({
        TableName: ACCOUNTS_TABLE(),
        Key: { account_id },
        ...expr,
        ReturnValues: 'ALL_NEW',
      })
    );
    return result.Attributes as IamAccount | undefined;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createDynamoRepositories(): Repositories {
  return {
    findings: new DynamoFindingsRepository(),
    scans: new DynamoScansRepository(),
    accounts: new DynamoAccountsRepository(),
  };
}
