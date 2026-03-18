/**
 * IAM Drift Intelligence — Scan Coordinator Controller
 *
 * Orchestrates account-level scan fan-out:
 *
 *   1. Resolve accounts to scan (from MONITORED_ACCOUNTS env var or DynamoDB)
 *   2. Generate a scan_id for each account
 *   3. Create scan records in DynamoDB (status: IN_PROGRESS)
 *   4. Push one ScanJobMessage per account to the scan SQS queue
 *
 * Triggered by:
 *   - EventBridge scheduled rule (daily)
 *   - Manual POST /api/scans/trigger (account_id + account_name in body)
 *
 * scan_id format: YYYY-MM-DD-account-{accountId}-scan-001
 * If multiple scans run on the same day, the suffix increments.
 *
 * Account resolution:
 *   MONITORED_ACCOUNTS env var: "111122223333:TechCorp,222233334444:ProdCorp"
 *   Falls back to accounts already in the DynamoDB iam-drift-accounts table.
 */

import { getRepositories } from '../repositories';
import { sendMessage, getScanQueueUrl } from '../lib/sqs';
import { IamScan } from '../types';
import { ScanJobMessage } from '../services/scanner/types';

export interface ManualScanRequest {
  account_id: string;
  account_name: string;
}

export interface CoordinatorResult {
  scans_triggered: number;
  scan_ids: string[];
}

// ─── Main Entry Points ────────────────────────────────────────────────────────

/** Triggered by EventBridge — scans all monitored accounts */
export async function triggerScheduledScan(): Promise<CoordinatorResult> {
  const accounts = await resolveMonitoredAccounts();

  if (accounts.length === 0) {
    console.warn(
      '[coordinator] No accounts configured. ' +
      'Set MONITORED_ACCOUNTS or add accounts to iam-drift-accounts table.'
    );
    return { scans_triggered: 0, scan_ids: [] };
  }

  console.log(`[coordinator] Triggering scan for ${accounts.length} account(s)`);
  return triggerScansForAccounts(accounts);
}

/** Triggered by POST /api/scans/trigger — scans a specific account */
export async function triggerManualScan(
  request: ManualScanRequest
): Promise<CoordinatorResult> {
  return triggerScansForAccounts([request]);
}

// ─── Core Fan-Out ─────────────────────────────────────────────────────────────

async function triggerScansForAccounts(
  accounts: ManualScanRequest[]
): Promise<CoordinatorResult> {
  const queueUrl = getScanQueueUrl();
  const repos = getRepositories();
  const scanIds: string[] = [];

  for (const account of accounts) {
    const scanId = await generateScanId(account.account_id);
    const now = new Date().toISOString();

    // Create scan record
    const scan: IamScan = {
      scan_id: scanId,
      account_id: account.account_id,
      account_name: account.account_name,
      scan_status: 'IN_PROGRESS',
      total_roles_scanned: 0,
      high_risk_count: 0,
      medium_risk_count: 0,
      low_risk_count: 0,
      health_score: 0,
      triggered_by: 'SCHEDULED',
      scan_started_at: now,
      scan_completed_at: null,
      executive_report: null,
      report_generated_at: null,
    };

    await repos.scans.put(scan);

    // Push to scan queue
    const message: ScanJobMessage = {
      scan_id: scanId,
      account_id: account.account_id,
      account_name: account.account_name,
    };

    await sendMessage(queueUrl, message);
    scanIds.push(scanId);

    console.log(`[coordinator] Queued scan ${scanId} for account ${account.account_id} (${account.account_name})`);
  }

  return { scans_triggered: scanIds.length, scan_ids: scanIds };
}

// ─── Account Resolution ───────────────────────────────────────────────────────

async function resolveMonitoredAccounts(): Promise<ManualScanRequest[]> {
  // 1. Try MONITORED_ACCOUNTS env var first
  const envAccounts = parseMonitoredAccountsEnv();
  if (envAccounts.length > 0) return envAccounts;

  // 2. Fall back to DynamoDB accounts table
  const repos = getRepositories();
  const dbAccounts = await repos.accounts.list();
  return dbAccounts.map((a) => ({
    account_id: a.account_id,
    account_name: a.account_name,
  }));
}

/**
 * Parses MONITORED_ACCOUNTS env var.
 * Format: "111122223333:TechCorp,222233334444:ProdCorp"
 * Simple account ID (no name): "111122223333" → name defaults to account ID
 */
function parseMonitoredAccountsEnv(): ManualScanRequest[] {
  const raw = process.env.MONITORED_ACCOUNTS;
  if (!raw) return [];

  return raw
    .split(',')
    .map((entry) => {
      const [account_id, ...nameParts] = entry.trim().split(':');
      return {
        account_id: account_id?.trim() ?? '',
        account_name: nameParts.join(':').trim() || account_id?.trim() || 'Unknown',
      };
    })
    .filter((a) => /^\d{12}$/.test(a.account_id));
}

// ─── Scan ID Generation ───────────────────────────────────────────────────────

/**
 * Generates a scan_id in the format:
 *   YYYY-MM-DD-account-{accountId}-scan-NNN
 *
 * If multiple scans exist for the same account on the same day,
 * the suffix increments. Pads to 3 digits (001, 002, ...).
 */
async function generateScanId(accountId: string): Promise<string> {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const prefix = `${date}-account-${accountId}-scan-`;

  const repos = getRepositories();
  const existingScans = await repos.scans.list();
  const todayScans = existingScans.filter((s) => s.scan_id.startsWith(prefix));
  const suffix = String(todayScans.length + 1).padStart(3, '0');

  return `${prefix}${suffix}`;
}
