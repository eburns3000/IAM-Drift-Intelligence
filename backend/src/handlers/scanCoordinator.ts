/**
 * IAM Drift Intelligence — Scan Coordinator Lambda Handler
 *
 * Triggered by:
 *   1. EventBridge scheduled rule (daily at 08:00 UTC) — scans all monitored accounts
 *   2. API Gateway POST /api/scans/trigger — manual scan for a specific account
 *
 * EventBridge event: standard scheduled event (no body parsing needed)
 * API Gateway event: body = { "account_id": "...", "account_name": "..." }
 *
 * Environment variables:
 *   MONITORED_ACCOUNTS  — comma-separated "accountId:AccountName" pairs
 *   SCAN_QUEUE_URL      — SQS queue URL for per-account scan messages
 *   DYNAMODB_TABLE_SCANS, DYNAMODB_TABLE_ACCOUNTS
 *   STORAGE_BACKEND=dynamodb
 */

import { APIGatewayProxyEventV2, ScheduledEvent, Context } from 'aws-lambda';
import 'dotenv/config';
import {
  triggerScheduledScan,
  triggerManualScan,
  ManualScanRequest,
} from '../controllers/coordinatorController';

type CoordinatorEvent = ScheduledEvent | APIGatewayProxyEventV2;

export const handler = async (
  event: CoordinatorEvent,
  _context: Context
): Promise<unknown> => {
  // Scheduled EventBridge event
  if (isScheduledEvent(event)) {
    console.log('[coordinator] EventBridge scheduled trigger');
    const result = await triggerScheduledScan();
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  }

  // Manual API Gateway trigger
  const apiEvent = event as APIGatewayProxyEventV2;
  const body = parseBody(apiEvent.body);

  if (!body?.account_id || !body?.account_name) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({
        error: 'account_id and account_name are required for manual scan trigger',
      }),
    };
  }

  const request: ManualScanRequest = {
    account_id: body.account_id,
    account_name: body.account_name,
  };

  console.log(
    `[coordinator] Manual trigger for account ${request.account_id} (${request.account_name})`
  );

  const result = await triggerManualScan(request);

  return {
    statusCode: 202,
    headers: corsHeaders(),
    body: JSON.stringify({
      message: `Scan triggered for account ${request.account_id}`,
      ...result,
    }),
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isScheduledEvent(event: CoordinatorEvent): event is ScheduledEvent {
  return 'source' in event && event.source === 'aws.events';
}

function parseBody(raw: string | null | undefined): Record<string, string> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function corsHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  };
}
