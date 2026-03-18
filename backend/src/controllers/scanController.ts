/**
 * IAM Drift Intelligence — Scan Controller
 *
 * Business logic for scan-related API routes.
 * Read queries handled here; write operations delegate to coordinatorController.
 */

import { getRepositories } from '../repositories';
import { triggerManualScan, ManualScanRequest } from './coordinatorController';
import { IamScan } from '../types';

export async function listScans(): Promise<IamScan[]> {
  const repos = getRepositories();
  const scans = await repos.scans.list();
  return scans.sort(
    (a, b) =>
      new Date(b.scan_started_at).getTime() - new Date(a.scan_started_at).getTime()
  );
}

export async function getScan(scanId: string): Promise<IamScan | undefined> {
  return getRepositories().scans.get(scanId);
}

export interface TriggerScanRequest {
  account_id: string;
  account_name: string;
}

export async function triggerScan(request: TriggerScanRequest) {
  const req: ManualScanRequest = {
    account_id: request.account_id,
    account_name: request.account_name,
  };
  return triggerManualScan(req);
}
