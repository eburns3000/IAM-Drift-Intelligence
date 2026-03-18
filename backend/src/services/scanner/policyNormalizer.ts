/**
 * IAM Drift Intelligence — Policy Normalizer
 *
 * Merges all policy documents collected for a role (inline + managed) into
 * a single normalized PolicyDocument.
 *
 * Normalization rules:
 *   - Action and Resource fields are always arrays (never strings)
 *   - All Allow and Deny statements from all documents are merged
 *   - Duplicate statements (by Sid) are deduplicated (first-wins)
 *   - Empty statement arrays are dropped
 *   - Version is always "2012-10-17"
 */

import { PolicyDocument, PolicyStatement } from '../../types';
import { RawRoleData, NormalizedRoleData } from './types';

/**
 * Merges all raw policy documents for a role into a single normalized
 * PolicyDocument and assembles a NormalizedRoleData.
 */
export function normalizeRoleData(raw: RawRoleData): NormalizedRoleData {
  return {
    role_arn: raw.role_arn,
    role_name: raw.role_name,
    role_path: raw.role_path,
    account_id: raw.account_id,
    last_used_date: raw.last_used_date,
    merged_policy: mergePolicies(raw.raw_policies),
    service_last_accessed: raw.service_last_accessed,
  };
}

/** Merges an array of PolicyDocuments into a single document. */
export function mergePolicies(docs: PolicyDocument[]): PolicyDocument {
  if (docs.length === 0) {
    return { Version: '2012-10-17', Statement: [] };
  }

  const seenSids = new Set<string>();
  const merged: PolicyStatement[] = [];

  for (const doc of docs) {
    for (const stmt of doc.Statement ?? []) {
      // Normalize Action and Resource to arrays
      const normalized = normalizeStatement(stmt);

      // Skip empty statements
      if (normalizedActions(normalized).length === 0) continue;

      // Deduplicate by Sid (first occurrence wins)
      if (normalized.Sid) {
        if (seenSids.has(normalized.Sid)) continue;
        seenSids.add(normalized.Sid);
      }

      merged.push(normalized);
    }
  }

  return { Version: '2012-10-17', Statement: merged };
}

/**
 * Normalizes a single statement:
 *   - Action → always string[]
 *   - Resource → always string[]
 */
export function normalizeStatement(stmt: PolicyStatement): PolicyStatement {
  return {
    ...stmt,
    Action: toArray(stmt.Action),
    Resource: toArray(stmt.Resource),
  };
}

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/** Returns the Action array from a normalized statement. */
export function normalizedActions(stmt: PolicyStatement): string[] {
  return toArray(stmt.Action);
}

/** Returns the Resource array from a normalized statement. */
export function normalizedResources(stmt: PolicyStatement): string[] {
  return toArray(stmt.Resource);
}
