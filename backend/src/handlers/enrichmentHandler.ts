/**
 * IAM Drift Intelligence — Enrichment Lambda Handler
 *
 * SQS trigger: receives one message per role from the scanner Lambda.
 *
 * Message shape (EnrichmentJobMessage):
 *   {
 *     "scan_id":    "2026-03-17-account-111122223333-scan-001",
 *     "role_id":    "arn:aws:iam::111122223333:role/cost-guardian-lambda-role",
 *     "account_id": "111122223333"
 *   }
 *
 * Returns SQSBatchResponse for partial failure reporting.
 * BatchSize: 1 — each Lambda invocation processes exactly one role.
 *
 * Timeout: 120s (set in SAM template) — AI calls take 5-30s,
 * policy simulation takes 5-30s, CloudTrail lookup takes 2-10s.
 * Total pipeline budget: ~90s typical, 115s worst-case.
 *
 * Concurrency: ReservedConcurrentExecutions: 10 (SAM template)
 * This caps parallel IAM simulator calls to avoid rate limiting.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY, AI_PROVIDER, SNS_ALERT_TOPIC_ARN
 *   DYNAMODB_TABLE_FINDINGS, DYNAMODB_TABLE_SCANS, DYNAMODB_TABLE_ACCOUNTS
 *   STORAGE_BACKEND=dynamodb
 */

import { SQSEvent, SQSBatchResponse, Context } from 'aws-lambda';
import 'dotenv/config';
import { runEnrichment } from '../controllers/enrichmentController';
import { EnrichmentJobMessage } from '../services/scanner/types';

export const handler = async (
  event: SQSEvent,
  _context: Context
): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    const messageId = record.messageId;

    try {
      const message = parseMessage(record.body, messageId);
      await runEnrichment(message);
    } catch (err) {
      console.error(`[enrichmentHandler] Failed to process message ${messageId}:`, err);
      batchItemFailures.push({ itemIdentifier: messageId });
    }
  }

  return { batchItemFailures };
};

function parseMessage(body: string, messageId: string): EnrichmentJobMessage {
  try {
    const parsed = JSON.parse(body) as EnrichmentJobMessage;
    if (!parsed.scan_id)    throw new Error('Missing scan_id');
    if (!parsed.role_id)    throw new Error('Missing role_id');
    if (!parsed.account_id) throw new Error('Missing account_id');
    return parsed;
  } catch (err) {
    throw new Error(
      `[enrichmentHandler] Invalid SQS message ${messageId}: ${err instanceof Error ? err.message : err}`
    );
  }
}
