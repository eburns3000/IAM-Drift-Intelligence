/**
 * IAM Drift Intelligence — IAM Client Factory
 *
 * Creates an IAMClient for the target account. For cross-account scanning,
 * this assumes the IamDriftScannerRole in the target account via STS.
 *
 * For same-account or local dev, no role assumption is needed — the
 * Lambda execution role or local credentials are used directly.
 *
 * Cross-account role assumption:
 *   Target role: arn:aws:iam::{account_id}:role/{crossAccountRoleName}
 *   Requires the scanner Lambda's execution role to have sts:AssumeRole
 *   permission on that ARN.
 */

import { IAMClient } from '@aws-sdk/client-iam';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';

const REGION = process.env.AWS_REGION || 'us-east-1';
const DEFAULT_ROLE_NAME = 'IamDriftScannerRole';

/**
 * Returns an IAMClient for the specified account.
 * If account_id matches the current account (or no cross-account role is
 * configured), uses ambient credentials. Otherwise assumes the scanner role.
 */
export async function getIamClientForAccount(
  account_id: string,
  crossAccountRoleName: string = DEFAULT_ROLE_NAME
): Promise<IAMClient> {
  // In local dev, skip role assumption — use ambient credentials directly
  if (process.env.NODE_ENV !== 'production' && !process.env.FORCE_CROSS_ACCOUNT) {
    return new IAMClient({ region: REGION });
  }

  // Determine current account to avoid unnecessary self-assumption
  const currentAccountId = await getCurrentAccountId();
  if (currentAccountId === account_id) {
    return new IAMClient({ region: REGION });
  }

  // Assume cross-account role
  const roleArn = `arn:aws:iam::${account_id}:role/${crossAccountRoleName}`;
  const stsClient = new STSClient({ region: REGION });

  const assumed = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: `iam-drift-scanner-${Date.now()}`,
      DurationSeconds: 3600,
    })
  );

  const creds = assumed.Credentials;
  if (!creds?.AccessKeyId || !creds?.SecretAccessKey || !creds?.SessionToken) {
    throw new Error(`Failed to assume role ${roleArn}: no credentials returned`);
  }

  return new IAMClient({
    region: REGION,
    credentials: {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
    },
  });
}

// Cache current account ID to avoid repeated STS calls
let _currentAccountId: string | null = null;

async function getCurrentAccountId(): Promise<string> {
  if (_currentAccountId) return _currentAccountId;
  const sts = new STSClient({ region: REGION });
  const { Account } = await sts.send(
    new (await import('@aws-sdk/client-sts')).GetCallerIdentityCommand({})
  );
  _currentAccountId = Account ?? '';
  return _currentAccountId;
}
