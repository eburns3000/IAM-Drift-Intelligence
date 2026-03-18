/**
 * IAM Drift Intelligence — API Service Layer
 *
 * All AWS calls route through the backend — never directly from the frontend.
 * Uses Vite proxy in development; VITE_API_BASE_URL for other environments.
 *
 *   Local dev     → '' (Vite proxy /api → Express :3001)
 *   SAM local     → http://localhost:3002 (VITE_API_BASE_URL)
 *   AWS prod      → https://{api-id}.execute-api.{region}.amazonaws.com/prod
 */

import axios from 'axios';
import {
  IamFinding,
  IamScan,
  DashboardMetrics,
  HealthScoreEntry,
  ReviewDecision,
  RiskLevel,
} from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';

const client = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

// ─── Scans ────────────────────────────────────────────────────────────────────

export const scansApi = {
  list: async (): Promise<IamScan[]> => {
    const res = await client.get('/scans');
    return res.data.data;
  },

  get: async (scanId: string): Promise<IamScan> => {
    const res = await client.get(`/scans/${encodeURIComponent(scanId)}`);
    return res.data.data;
  },

  trigger: async (accountId: string, accountName: string): Promise<{ scan_ids: string[]; scans_triggered: number }> => {
    const res = await client.post('/scans/trigger', { account_id: accountId, account_name: accountName });
    return res.data.data;
  },
};

// ─── Findings ─────────────────────────────────────────────────────────────────

export interface FindingFilters {
  scan_id?: string;
  review_decision?: ReviewDecision;
  risk_level?: RiskLevel;
  account_id?: string;
}

export const findingsApi = {
  list: async (filters?: FindingFilters): Promise<IamFinding[]> => {
    const params = new URLSearchParams();
    if (filters?.scan_id) params.set('scan_id', filters.scan_id);
    if (filters?.review_decision) params.set('review_decision', filters.review_decision);
    if (filters?.risk_level) params.set('risk_level', filters.risk_level);
    if (filters?.account_id) params.set('account_id', filters.account_id);
    const res = await client.get(`/findings?${params.toString()}`);
    return res.data.data;
  },

  get: async (scanId: string, roleId: string): Promise<IamFinding> => {
    const res = await client.get(
      `/findings/${encodeURIComponent(roleId)}?scan_id=${encodeURIComponent(scanId)}`
    );
    return res.data.data;
  },

  approve: async (
    roleId: string,
    scanId: string,
    reviewedBy: string,
    reviewNotes?: string
  ): Promise<IamFinding> => {
    const res = await client.patch(`/findings/${encodeURIComponent(roleId)}/approve`, {
      scan_id: scanId,
      reviewed_by: reviewedBy,
      review_notes: reviewNotes,
    });
    return res.data.data;
  },

  reject: async (
    roleId: string,
    scanId: string,
    reviewedBy: string,
    reviewNotes: string
  ): Promise<IamFinding> => {
    const res = await client.patch(`/findings/${encodeURIComponent(roleId)}/reject`, {
      scan_id: scanId,
      reviewed_by: reviewedBy,
      review_notes: reviewNotes,
    });
    return res.data.data;
  },

  rollback: async (roleId: string, scanId: string, rolledBackBy: string): Promise<IamFinding> => {
    const res = await client.post(`/findings/${encodeURIComponent(roleId)}/rollback`, {
      scan_id: scanId,
      rolled_back_by: rolledBackBy,
    });
    return res.data.data;
  },
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  getMetrics: async (): Promise<DashboardMetrics> => {
    const res = await client.get('/dashboard/metrics');
    return res.data.data;
  },

  getHealth: async (accountId?: string): Promise<{ account_id: string; account_name: string; history: HealthScoreEntry[] }> => {
    const params = accountId ? `?account_id=${encodeURIComponent(accountId)}` : '';
    const res = await client.get(`/dashboard/health${params}`);
    return res.data.data;
  },
};

// ─── Reports ──────────────────────────────────────────────────────────────────

export const reportsApi = {
  list: async (): Promise<IamScan[]> => {
    const res = await client.get('/reports');
    return res.data.data;
  },

  getLatest: async (): Promise<IamScan | null> => {
    try {
      const res = await client.get('/reports/latest');
      return res.data.data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      throw err;
    }
  },

  generate: async (scanId?: string): Promise<IamScan> => {
    const res = await client.post('/reports/generate', scanId ? { scan_id: scanId } : {});
    return res.data.data;
  },
};
