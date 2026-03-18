/**
 * IAM Drift Intelligence — DynamoDB Client + Helpers
 *
 * Shared DocumentClient configured for either DynamoDB Local (dev)
 * or AWS DynamoDB (production). Mirrors the MigrationOps pattern.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// ─── Client Factory ───────────────────────────────────────────────────────────

function createClient(): DynamoDBDocumentClient {
  const endpoint = process.env.DYNAMODB_ENDPOINT;

  const baseClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    ...(endpoint ? { endpoint } : {}),
    ...(endpoint
      ? {
          credentials: {
            accessKeyId: 'local',
            secretAccessKey: 'local',
          },
        }
      : {}),
  });

  return DynamoDBDocumentClient.from(baseClient, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
  });
}

export const docClient = createClient();

// ─── Table Name Accessors ─────────────────────────────────────────────────────

export const FINDINGS_TABLE = () =>
  process.env.DYNAMODB_TABLE_FINDINGS || 'iam-drift-findings';

export const SCANS_TABLE = () =>
  process.env.DYNAMODB_TABLE_SCANS || 'iam-drift-scans';

export const ACCOUNTS_TABLE = () =>
  process.env.DYNAMODB_TABLE_ACCOUNTS || 'iam-drift-accounts';

// ─── Update Expression Builder ────────────────────────────────────────────────

/**
 * Builds a DynamoDB UpdateItem expression from a flat updates object.
 * Handles reserved word escaping via ExpressionAttributeNames.
 *
 * Returns: { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues }
 */
export function buildUpdateExpression(updates: Record<string, unknown>): {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
} {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];

  for (const [key, value] of Object.entries(updates)) {
    const nameKey = `#${key}`;
    const valueKey = `:${key}`;
    names[nameKey] = key;
    values[valueKey] = value;
    sets.push(`${nameKey} = ${valueKey}`);
  }

  return {
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}
