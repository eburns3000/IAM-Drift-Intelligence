/**
 * IAM Drift Intelligence — Deterministic Detector
 *
 * Runs purely deterministic analysis on a normalized IAM policy. No AWS API
 * calls — all inputs come from the collected and normalized role data.
 *
 * Detection:
 *   1. Wildcard actions  — Action is '*' or 'service:*' in any Allow statement
 *   2. Wildcard resources — Resource is '*' in any Allow statement
 *   3. Unused services   — Services present in policy but never accessed
 *                          (from IAM service last-accessed report; >90 days = unused)
 *
 * Risk Scoring (weighted additive model):
 *   +5 per wildcard action  (e.g., ec2:* counts once, s3:* counts once)
 *   +3 if any Allow statement has Resource '*' (flat, not per-statement)
 *   +4 per unused service in the policy
 *   +2 if the role is customer-managed (path is '/' not '/aws-service-role/')
 *
 * Risk Level thresholds:
 *   CRITICAL : score >= 22
 *   HIGH     : score >= 13
 *   MEDIUM   : score >= 6
 *   LOW      : score < 6
 *
 * AI enriches findings — this detector never generates remediation content.
 */

import { PolicyStatement } from '../../types';
import { NormalizedRoleData, DetectionResult, ServiceLastAccessedEntry } from './types';

// Days before a service is considered unused
const UNUSED_SERVICE_THRESHOLD_DAYS = 90;

// ─── Risk Score Weights ───────────────────────────────────────────────────────

const WEIGHT_WILDCARD_ACTION = 5;
const WEIGHT_WILDCARD_RESOURCE = 3;   // flat: applied once if any Resource is '*'
const WEIGHT_UNUSED_SERVICE = 4;
const WEIGHT_CUSTOMER_MANAGED = 2;

// ─── Risk Level Thresholds ────────────────────────────────────────────────────

function scoreToRiskLevel(score: number): DetectionResult['risk_level'] {
  if (score >= 22) return 'CRITICAL';
  if (score >= 13) return 'HIGH';
  if (score >= 6)  return 'MEDIUM';
  return 'LOW';
}

// ─── Main Detector ────────────────────────────────────────────────────────────

export function detectFindings(role: NormalizedRoleData): DetectionResult {
  const allowStatements = getAllowStatements(role.merged_policy.Statement);

  const wildcardActions  = detectWildcardActions(allowStatements);
  const wildcardResources = detectWildcardResources(allowStatements);
  const servicesBefore   = extractServicesBefore(allowStatements);
  const unusedServices   = detectUnusedServices(servicesBefore, role.service_last_accessed);
  const permissionCount  = countPermissions(allowStatements);

  const isCustomerManaged = !role.role_path.startsWith('/aws-service-role/');

  // ── Risk Score ──────────────────────────────────────────────────────────────
  let score = 0;
  score += wildcardActions.length * WEIGHT_WILDCARD_ACTION;
  if (wildcardResources.length > 0) score += WEIGHT_WILDCARD_RESOURCE;
  score += unusedServices.length * WEIGHT_UNUSED_SERVICE;
  if (isCustomerManaged) score += WEIGHT_CUSTOMER_MANAGED;

  return {
    wildcard_actions:        wildcardActions,
    wildcard_resources:      wildcardResources,
    unused_services:         unusedServices,
    services_before:         servicesBefore,
    permission_count_before: permissionCount,
    risk_score:              score,
    risk_level:              scoreToRiskLevel(score),
  };
}

// ─── Detection Helpers ────────────────────────────────────────────────────────

function getAllowStatements(statements: PolicyStatement[]): PolicyStatement[] {
  return statements.filter((s) => s.Effect === 'Allow');
}

/**
 * Detects wildcard actions in Allow statements.
 * A wildcard action is:
 *   - Exactly '*'  (all services, all actions)
 *   - 'service:*'  (all actions within a service, e.g. 'ec2:*')
 */
function detectWildcardActions(statements: PolicyStatement[]): string[] {
  const wildcards = new Set<string>();

  for (const stmt of statements) {
    const actions = toArray(stmt.Action);
    for (const action of actions) {
      if (action === '*' || /^[a-zA-Z0-9_-]+:\*$/.test(action)) {
        wildcards.add(action);
      }
    }
  }

  return Array.from(wildcards).sort();
}

/**
 * Detects Resource '*' in Allow statements.
 * Returns unique resource wildcards (typically just ['*']).
 */
function detectWildcardResources(statements: PolicyStatement[]): string[] {
  const wildcards = new Set<string>();

  for (const stmt of statements) {
    const resources = toArray(stmt.Resource);
    for (const resource of resources) {
      if (resource === '*') {
        wildcards.add(resource);
      }
    }
  }

  return Array.from(wildcards);
}

/**
 * Extracts the set of unique AWS service namespaces present in Allow actions.
 * e.g. ['s3:GetObject', 'ec2:*'] → ['ec2', 's3']
 */
function extractServicesBefore(statements: PolicyStatement[]): string[] {
  const services = new Set<string>();

  for (const stmt of statements) {
    const actions = toArray(stmt.Action);
    for (const action of actions) {
      if (action === '*') {
        // All-service wildcard — we cannot enumerate; mark as 'all'
        services.add('*');
      } else {
        const prefix = action.split(':')[0];
        if (prefix) services.add(prefix.toLowerCase());
      }
    }
  }

  // Remove the '*' sentinel — it means all services were accessible
  services.delete('*');

  return Array.from(services).sort();
}

/**
 * Identifies services present in the policy but not accessed within the threshold.
 *
 * Cross-references:
 *   - servicesBefore: services extracted from the policy
 *   - serviceLastAccessed: IAM report from GenerateServiceLastAccessedDetails
 *
 * If no last-accessed report is available (empty array), returns [] — the
 * enrichment stage will determine unused services via CloudTrail.
 */
function detectUnusedServices(
  servicesBefore: string[],
  serviceLastAccessed: ServiceLastAccessedEntry[]
): string[] {
  if (serviceLastAccessed.length === 0) return [];

  const lastAccessedMap = new Map<string, string | null>();
  for (const entry of serviceLastAccessed) {
    lastAccessedMap.set(entry.service_namespace, entry.last_authenticated);
  }

  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - UNUSED_SERVICE_THRESHOLD_DAYS);

  const unused: string[] = [];
  for (const service of servicesBefore) {
    const lastAuth = lastAccessedMap.get(service);

    if (lastAuth === undefined) {
      // Service is in the policy but absent from the IAM last-accessed report
      // This can happen if the service has never been used at all
      unused.push(service);
    } else if (lastAuth === null) {
      // Service has never been used
      unused.push(service);
    } else {
      // Service was used — check if it was used recently enough
      const lastAuthDate = new Date(lastAuth);
      if (lastAuthDate < thresholdDate) {
        unused.push(service);
      }
    }
  }

  return unused.sort();
}

/**
 * Counts total individual action strings across all Allow statements.
 * Wildcards ('ec2:*', '*') each count as 1 entry.
 * This gives permission_count_before — the "before" side of the reduction metric.
 */
function countPermissions(statements: PolicyStatement[]): number {
  const actions = new Set<string>();
  for (const stmt of statements) {
    for (const action of toArray(stmt.Action)) {
      actions.add(action.toLowerCase());
    }
  }
  return actions.size;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
