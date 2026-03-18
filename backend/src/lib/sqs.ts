/**
 * IAM Drift Intelligence — SQS Client + Helpers
 *
 * Shared SQS client with a type-safe sendMessage helper.
 * All queue URLs come from environment variables.
 */

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Sends a JSON-serialized message to an SQS queue.
 * Throws if QUEUE_URL is missing (misconfigured Lambda environment).
 */
export async function sendMessage<T>(queueUrl: string, body: T): Promise<void> {
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
    })
  );
}

// ─── Queue URL Accessors ──────────────────────────────────────────────────────

export function getEnrichmentQueueUrl(): string {
  const url = process.env.ENRICHMENT_QUEUE_URL;
  if (!url) throw new Error('ENRICHMENT_QUEUE_URL environment variable is not set');
  return url;
}

export function getScanQueueUrl(): string {
  const url = process.env.SCAN_QUEUE_URL;
  if (!url) throw new Error('SCAN_QUEUE_URL environment variable is not set');
  return url;
}
