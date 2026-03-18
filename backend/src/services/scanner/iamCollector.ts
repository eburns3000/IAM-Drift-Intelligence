/**
 * IAM Drift Intelligence — IAM Data Collector
 *
 * Enumerates all IAM roles in a target account and collects:
 *   - Role metadata (ARN, path, last-used date)
 *   - Inline policies (GetRolePolicy)
 *   - Attached managed policies (GetPolicy + GetPolicyVersion)
 *   - Service last-accessed report (GenerateServiceLastAccessedDetails)
 *
 * Excluded roles:
 *   - Service-linked roles (path starts with /aws-service-role/)
 *   - AWS-reserved paths (/aws-reserved/)
 *
 * Service last-accessed collection:
 *   Jobs are started concurrently for all roles, then a single poll round
 *   retrieves available results. Roles whose jobs aren't ready get an empty
 *   service_last_accessed list — the enrichment stage fills these via CloudTrail.
 */

import {
  IAMClient,
  ListRolesCommand,
  GetRoleCommand,
  ListAttachedRolePoliciesCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  ListRolePoliciesCommand,
  GetRolePolicyCommand,
  GenerateServiceLastAccessedDetailsCommand,
  GetServiceLastAccessedDetailsCommand,
  Role,
} from '@aws-sdk/client-iam';
import { PolicyDocument, PolicyStatement } from '../../types';
import { RawRoleData, ServiceLastAccessedEntry } from './types';

// ─── Role Enumeration ─────────────────────────────────────────────────────────

/** Returns all customer-managed IAM roles in the account (excludes service-linked). */
export async function listCustomerRoles(iamClient: IAMClient): Promise<Role[]> {
  const roles: Role[] = [];
  let marker: string | undefined;

  do {
    const response = await iamClient.send(
      new ListRolesCommand({ Marker: marker, MaxItems: 100 })
    );
    for (const role of response.Roles ?? []) {
      if (isCustomerManagedRole(role)) {
        roles.push(role);
      }
    }
    marker = response.IsTruncated ? response.Marker : undefined;
  } while (marker);

  return roles;
}

/** Exclude service-linked and AWS-reserved roles */
function isCustomerManagedRole(role: Role): boolean {
  const path = role.Path ?? '/';
  if (path.startsWith('/aws-service-role/')) return false;
  if (path.startsWith('/aws-reserved/')) return false;
  return true;
}

// ─── Policy Collection ────────────────────────────────────────────────────────

/** Collects all policy documents for a role: inline + attached managed. */
async function collectPoliciesForRole(
  iamClient: IAMClient,
  roleName: string
): Promise<PolicyDocument[]> {
  const [inlinePolicies, managedPolicies] = await Promise.all([
    collectInlinePolicies(iamClient, roleName),
    collectManagedPolicies(iamClient, roleName),
  ]);
  return [...inlinePolicies, ...managedPolicies];
}

async function collectInlinePolicies(
  iamClient: IAMClient,
  roleName: string
): Promise<PolicyDocument[]> {
  // 1. List inline policy names
  const listResult = await iamClient.send(
    new ListRolePoliciesCommand({ RoleName: roleName })
  );
  const policyNames = listResult.PolicyNames ?? [];

  // 2. Fetch each inline policy document
  const docs = await Promise.all(
    policyNames.map(async (policyName) => {
      const result = await iamClient.send(
        new GetRolePolicyCommand({ RoleName: roleName, PolicyName: policyName })
      );
      return decodePolicyDocument(result.PolicyDocument ?? '{}');
    })
  );

  return docs.filter((d): d is PolicyDocument => d !== null);
}

async function collectManagedPolicies(
  iamClient: IAMClient,
  roleName: string
): Promise<PolicyDocument[]> {
  // 1. List attached managed policies
  const listResult = await iamClient.send(
    new ListAttachedRolePoliciesCommand({ RoleName: roleName })
  );
  const attachedPolicies = listResult.AttachedPolicies ?? [];

  // 2. Fetch the default version document for each managed policy
  const docs = await Promise.all(
    attachedPolicies.map(async (attached) => {
      if (!attached.PolicyArn) return null;

      const policyResult = await iamClient.send(
        new GetPolicyCommand({ PolicyArn: attached.PolicyArn })
      );
      const defaultVersionId = policyResult.Policy?.DefaultVersionId;
      if (!defaultVersionId) return null;

      const versionResult = await iamClient.send(
        new GetPolicyVersionCommand({
          PolicyArn: attached.PolicyArn,
          VersionId: defaultVersionId,
        })
      );
      return decodePolicyDocument(versionResult.PolicyVersion?.Document ?? '{}');
    })
  );

  return docs.filter((d): d is PolicyDocument => d !== null);
}

/**
 * IAM returns policy documents as URL-encoded JSON strings.
 * Decode, parse, and validate the structure.
 */
function decodePolicyDocument(encoded: string): PolicyDocument | null {
  try {
    const decoded = decodeURIComponent(encoded);
    const parsed = JSON.parse(decoded);
    if (!parsed.Statement) return null;
    // Normalise Statement to always be an array
    if (!Array.isArray(parsed.Statement)) {
      parsed.Statement = [parsed.Statement];
    }
    return parsed as PolicyDocument;
  } catch {
    return null;
  }
}

// ─── Service Last-Accessed ────────────────────────────────────────────────────

/** Starts a service last-accessed report generation job. Returns job ID or null. */
export async function startServiceLastAccessedJob(
  iamClient: IAMClient,
  roleArn: string
): Promise<string | null> {
  try {
    const result = await iamClient.send(
      new GenerateServiceLastAccessedDetailsCommand({
        Arn: roleArn,
        Granularity: 'SERVICE_LEVEL',
      })
    );
    return result.JobId ?? null;
  } catch {
    return null;
  }
}

/** Retrieves service last-accessed results. Returns empty array if not ready or failed. */
export async function getServiceLastAccessedResults(
  iamClient: IAMClient,
  jobId: string
): Promise<ServiceLastAccessedEntry[]> {
  try {
    const result = await iamClient.send(
      new GetServiceLastAccessedDetailsCommand({ JobId: jobId })
    );

    if (result.JobStatus !== 'COMPLETED') return [];

    return (result.ServicesLastAccessed ?? []).map((s) => ({
      service_namespace: (s.ServiceNamespace ?? '').toLowerCase(),
      last_authenticated: s.LastAuthenticated?.toISOString() ?? null,
      total_authenticated_entities: s.TotalAuthenticatedEntities ?? 0,
    }));
  } catch {
    return [];
  }
}

// ─── Main Collection Orchestrator ─────────────────────────────────────────────

/**
 * Collects full IAM data for all customer roles in an account.
 *
 * Strategy:
 *   1. List all customer-managed roles
 *   2. Start service last-accessed jobs for all roles in parallel
 *   3. Collect policy documents for all roles in parallel (concurrency-limited)
 *   4. Wait briefly, then retrieve service last-accessed results
 *   5. Return assembled RawRoleData[]
 *
 * Concurrency is capped at 10 roles at a time to stay within IAM rate limits.
 */
export async function collectAccountRoles(
  iamClient: IAMClient,
  accountId: string
): Promise<RawRoleData[]> {
  // 1. List all customer roles
  const roles = await listCustomerRoles(iamClient);
  if (roles.length === 0) return [];

  console.log(`[iamCollector] Found ${roles.length} customer-managed roles`);

  // 2. Start all service last-accessed jobs upfront (parallel, fast)
  const jobIds = await Promise.all(
    roles.map((r) =>
      r.Arn ? startServiceLastAccessedJob(iamClient, r.Arn) : Promise.resolve(null)
    )
  );

  // 3. Collect policy data for all roles (batched in groups of 10)
  const rawData: RawRoleData[] = await collectInBatches(
    roles,
    10,
    async (role, idx): Promise<RawRoleData> => {
      const roleName = role.RoleName!;
      const roleArn = role.Arn!;

      // Get last-used date
      let lastUsedDate: string | null = null;
      try {
        const detail = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
        const lastUsed = detail.Role?.RoleLastUsed?.LastUsedDate;
        lastUsedDate = lastUsed ? lastUsed.toISOString() : null;
      } catch {
        // Non-fatal — continue without last-used
      }

      // Collect all policy documents
      let rawPolicies: PolicyDocument[] = [];
      try {
        rawPolicies = await collectPoliciesForRole(iamClient, roleName);
      } catch (err) {
        console.warn(`[iamCollector] Failed to collect policies for ${roleName}:`, err);
      }

      return {
        role_arn: roleArn,
        role_name: roleName,
        role_path: role.Path ?? '/',
        account_id: accountId,
        last_used_date: lastUsedDate,
        raw_policies: rawPolicies,
        service_last_accessed: [],
        service_last_accessed_job_id: jobIds[idx] ?? null,
      };
    }
  );

  // 4. Wait for service last-accessed jobs to complete (IAM jobs are fast, ~2-5s)
  const POLL_WAIT_MS = 4000;
  await sleep(POLL_WAIT_MS);

  // 5. Retrieve service last-accessed results
  await Promise.all(
    rawData.map(async (data) => {
      if (!data.service_last_accessed_job_id) return;
      data.service_last_accessed = await getServiceLastAccessedResults(
        iamClient,
        data.service_last_accessed_job_id
      );
    })
  );

  const withLastAccessed = rawData.filter((d) => d.service_last_accessed.length > 0).length;
  console.log(
    `[iamCollector] Service last-accessed available for ${withLastAccessed}/${rawData.length} roles`
  );

  return rawData;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function collectInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((item, j) => fn(item, i + j)));
    results.push(...batchResults);
  }
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
