/**
 * IAM Drift Intelligence — Scanner Lambda Handler
 *
 * SQS trigger: receives one message per account from the scan coordinator.
 *
 * Message shape (ScanJobMessage):
 *   {
 *     "scan_id":   "2026-03-17-account-111122223333-scan-001",
 *     "account_id": "111122223333",
 *     "account_name": "TechCorp",
 *     "cross_account_role_name": "IamDriftScannerRole"   // optional
 *   }
 *
 * Returns an SQSBatchResponse so Lambda can report partial failures back to SQS.
 * If a message fails, it is returned as a batchItemFailure so SQS retries it
 * independently without reprocessing successfully-handled messages.
 *
 * Concurrency:
 *   The SAM template sets ReservedConcurrentExecutions: 5 on this function so
 *   at most 5 accounts are scanned in parallel. Each invocation processes exactly
 *   one SQS message (BatchSize: 1).
 *
 * Environment variables required:
 *   ENRICHMENT_QUEUE_URL  — SQS queue URL for role-level enrichment jobs
 *   DYNAMODB_TABLE_FINDINGS, DYNAMODB_TABLE_SCANS, DYNAMODB_TABLE_ACCOUNTS
 *   STORAGE_BACKEND=dynamodb  (in production)
 */

import { SQSEvent, SQSBatchResponse, Context } from 'aws-lambda';
import 'dotenv/config';
import { runAccountScan } from '../controllers/scannerController';
import { ScanJobMessage } from '../services/scanner/types';

export const handler = async (
  event: SQSEvent,
  _context: Context
): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    const messageId = record.messageId;

    try {
      const message = parseMessage(record.body, messageId);
      await runAccountScan(message);
    } catch (err) {
      console.error(`[scannerHandler] Failed to process message ${messageId}:`, err);
      batchItemFailures.push({ itemIdentifier: messageId });
    }
  }

  return { batchItemFailures };
};

function parseMessage(body: string, messageId: string): ScanJobMessage {
  try {
    const parsed = JSON.parse(body) as ScanJobMessage;

    if (!parsed.scan_id)    throw new Error('Missing scan_id');
    if (!parsed.account_id) throw new Error('Missing account_id');
    if (!parsed.account_name) throw new Error('Missing account_name');

    return parsed;
  } catch (err) {
    throw new Error(
      `[scannerHandler] Invalid SQS message ${messageId}: ${err instanceof Error ? err.message : err}`
    );
  }
}
