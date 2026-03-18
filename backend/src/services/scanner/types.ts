/**
 * IAM Drift Intelligence — Scanner Internal Types
 *
 * Intermediate data structures used within the scanner pipeline.
 * These are never written to DynamoDB directly — they are inputs
 * to the policy normalizer and detector before IamFinding assembly.
 */

import { PolicyDocument } from '../../types';

// ─── SQS Message Contracts ────────────────────────────────────────────────────

/** Message pushed to the scan queue by the coordinator */
export interface ScanJobMessage {
  scan_id: string;
  account_id: string;
  account_name: string;
  /** Optional: override the cross-account role name (default: IamDriftScannerRole) */
  cross_account_role_name?: string;
}

/** Message pushed to the enrichment queue by the scanner, one per role */
export interface EnrichmentJobMessage {
  scan_id: string;
  role_id: string;  // role ARN
  account_id: string;
}

// ─── Raw IAM Data ─────────────────────────────────────────────────────────────

/** Per-service last-accessed entry from IAM GenerateServiceLastAccessedDetails */
export interface ServiceLastAccessedEntry {
  /** Lowercased service namespace, e.g. 's3', 'ec2', 'iam' */
  service_namespace: string;
  /** ISO timestamp of last authenticated call, or null if never used */
  last_authenticated: string | null;
  /** Total authenticated entities that accessed this service */
  total_authenticated_entities: number;
}

/** All data collected from IAM for a single role before normalization */
export interface RawRoleData {
  role_arn: string;
  role_name: string;
  role_path: string;
  account_id: string;
  /** ISO timestamp from RoleLastUsed, or null */
  last_used_date: string | null;
  /** All policy documents collected (inline + managed), un-merged */
  raw_policies: PolicyDocument[];
  /** Per-service last-accessed report. Empty if not yet available. */
  service_last_accessed: ServiceLastAccessedEntry[];
  /** IAM job ID for the service last-accessed report (used to poll later) */
  service_last_accessed_job_id: string | null;
}

// ─── Normalized Data ──────────────────────────────────────────────────────────

/** Single merged + normalized policy for a role */
export interface NormalizedRoleData {
  role_arn: string;
  role_name: string;
  role_path: string;
  account_id: string;
  last_used_date: string | null;
  /** All Allow + Deny statements from all policies merged into one document */
  merged_policy: PolicyDocument;
  service_last_accessed: ServiceLastAccessedEntry[];
}

// ─── Detection Results ────────────────────────────────────────────────────────

/** Output of the deterministic detector for a single role */
export interface DetectionResult {
  wildcard_actions: string[];
  wildcard_resources: string[];
  unused_services: string[];
  services_before: string[];
  permission_count_before: number;
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
