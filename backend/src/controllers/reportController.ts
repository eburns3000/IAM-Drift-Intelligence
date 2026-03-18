/**
 * IAM Drift Intelligence — Report Controller
 *
 * Manages executive report generation and retrieval.
 * Reports are AI-generated and stored as markdown on the IamScan record.
 *
 * Routes:
 *   POST /api/reports/generate  — calls AI generateExecutiveSummary, stores on scan
 *   GET  /api/reports           — list all scans that have a report
 *   GET  /api/reports/latest    — most recently generated report
 */

import { getRepositories } from '../repositories';
import { getAIProvider } from '../services/ai';
import { IamScan } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReportSummary {
  scan_id: string;
  account_id: string;
  account_name: string;
  health_score: number;
  report_generated_at: string;
  executive_summary_preview: string;
}

export interface ReportError {
  code: 'NOT_FOUND' | 'NO_FINDINGS' | 'AI_UNAVAILABLE';
  message: string;
}

// ─── Generate ─────────────────────────────────────────────────────────────────

export interface GenerateReportRequest {
  /** Defaults to latest scan when omitted */
  scan_id?: string;
}

export async function generateReport(
  request: GenerateReportRequest
): Promise<{ scan?: IamScan; error?: ReportError }> {
  const repos = getRepositories();

  const scan = request.scan_id
    ? await repos.scans.get(request.scan_id)
    : await repos.scans.getLatest();

  if (!scan) {
    return { error: { code: 'NOT_FOUND', message: 'No scan found' } };
  }

  const findings = await repos.findings.listByScanId(scan.scan_id);
  if (findings.length === 0) {
    return { error: { code: 'NO_FINDINGS', message: 'No findings found for this scan' } };
  }

  const account = await repos.accounts.get(scan.account_id);
  const ai = getAIProvider();

  let output;
  try {
    output = await ai.generateExecutiveSummary({
      scan,
      findings,
      account_name: account?.account_name ?? scan.account_name,
    });
  } catch (err) {
    return {
      error: {
        code: 'AI_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'AI provider failed',
      },
    };
  }

  const now = new Date().toISOString();
  const reportMarkdown = [
    `# IAM Governance Executive Report`,
    ``,
    `**Account:** ${account?.account_name ?? scan.account_name} (${scan.account_id})`,
    `**Scan ID:** ${scan.scan_id}`,
    `**Generated:** ${now}`,
    `**Health Score:** ${scan.health_score}/100`,
    ``,
    `---`,
    ``,
    `## Executive Summary`,
    ``,
    output.executive_summary,
    ``,
    `## Key Findings`,
    ``,
    output.key_findings,
    ``,
    `## Remediation Progress`,
    ``,
    output.remediation_progress,
    ``,
    `## Risk Trends`,
    ``,
    output.risk_trends,
    ``,
    `## Recommendations`,
    ``,
    output.recommendations,
  ].join('\n');

  const updated = await repos.scans.update(scan.scan_id, {
    executive_report: reportMarkdown,
    report_generated_at: now,
  });

  return { scan: updated };
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listReports(): Promise<ReportSummary[]> {
  const repos = getRepositories();
  const scans = await repos.scans.list();

  return scans
    .filter((s) => s.executive_report && s.report_generated_at)
    .sort(
      (a, b) =>
        new Date(b.report_generated_at!).getTime() - new Date(a.report_generated_at!).getTime()
    )
    .map((s) => ({
      scan_id: s.scan_id,
      account_id: s.account_id,
      account_name: s.account_name,
      health_score: s.health_score,
      report_generated_at: s.report_generated_at!,
      executive_summary_preview: s.executive_report!.slice(0, 400),
    }));
}

// ─── Get Latest ───────────────────────────────────────────────────────────────

export async function getLatestReport(): Promise<IamScan | undefined> {
  const repos = getRepositories();
  const scans = await repos.scans.list();

  return scans
    .filter((s) => s.executive_report && s.report_generated_at)
    .sort(
      (a, b) =>
        new Date(b.report_generated_at!).getTime() - new Date(a.report_generated_at!).getTime()
    )[0];
}
