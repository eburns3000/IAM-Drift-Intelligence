/**
 * IAM Drift Intelligence — API Lambda Handler
 *
 * Single Lambda function behind API Gateway HTTP API (catch-all /api/{proxy+}).
 * Routes all API requests by parsing rawPath + HTTP method.
 *
 * Routes:
 *   POST  /api/scans/trigger              → triggerScan
 *   GET   /api/scans                      → listScans
 *   GET   /api/scans/:scan_id             → getScan
 *
 *   GET   /api/findings                   → listFindings (query: scan_id, review_decision, risk_level, account_id)
 *   GET   /api/findings/:id               → getFinding (query: scan_id required)
 *   PATCH /api/findings/:id/approve       → approveFinding (body: scan_id, reviewed_by, review_notes)
 *   PATCH /api/findings/:id/reject        → rejectFinding  (body: scan_id, reviewed_by, review_notes)
 *   POST  /api/findings/:id/rollback      → rollbackFinding (body: scan_id, rolled_back_by)
 *
 *   GET   /api/dashboard/metrics          → getDashboardMetrics
 *   GET   /api/dashboard/health           → getHealthHistory (query: account_id optional)
 *
 *   GET   /api/reports                    → listReports
 *   GET   /api/reports/latest             → getLatestReport
 *   POST  /api/reports/generate           → generateReport (body: scan_id optional)
 *
 * Path routing strategy:
 *   rawPath is split on '/' and each segment is URL-decoded individually.
 *   This correctly handles role ARNs (which contain ':' and '/') passed as
 *   path parameters when the client uses encodeURIComponent().
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY, AI_PROVIDER, STORAGE_BACKEND, CORS_ORIGIN
 *   DYNAMODB_TABLE_FINDINGS, DYNAMODB_TABLE_SCANS, DYNAMODB_TABLE_ACCOUNTS
 */

import 'dotenv/config';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ensureBootstrapped } from '../data/bootstrap';
import * as scanCtrl from '../controllers/scanController';
import * as findingCtrl from '../controllers/findingController';
import * as dashboardCtrl from '../controllers/dashboardController';
import * as reportCtrl from '../controllers/reportController';
import {
  ok,
  created,
  badRequest,
  notFound,
  conflict,
  serverError,
  parseBody,
} from './utils';

// Bootstrap once per Lambda cold start
const initPromise = ensureBootstrapped();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  await initPromise;

  const method = event.requestContext.http.method.toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      },
      body: '',
    };
  }

  // Parse path into segments.
  // HTTP API v2 includes the stage name in rawPath: /prod/api/dashboard/metrics
  // Strip it using requestContext.stage before matching routes.
  const rawPath = event.rawPath ?? '';
  const stage = event.requestContext?.stage;
  const pathWithoutStage =
    stage && stage !== '$default'
      ? rawPath.replace(new RegExp(`^\\/${stage}`), '')
      : rawPath;
  const pathWithoutPrefix = pathWithoutStage.replace(/^\/api\/?/, '');
  const rawSegments = pathWithoutPrefix.split('/').filter(Boolean);
  const segments = rawSegments.map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });

  const qs = event.queryStringParameters ?? {};

  // ── /api (health check) ───────────────────────────────────────────────────
  if (segments.length === 0) {
    return ok({ status: 'healthy', service: 'iam-drift-intelligence-api' });
  }

  const resource = segments[0]; // 'scans' | 'findings' | 'dashboard' | 'reports'

  try {
    // ── Scans ───────────────────────────────────────────────────────────────

    if (resource === 'scans') {
      const subId = segments[1];
      const subAction = segments[2];

      // POST /api/scans/trigger
      if (method === 'POST' && subId === 'trigger') {
        const body = parseBody<{ account_id?: string; account_name?: string }>(event.body);
        if (!body.account_id || !body.account_name) {
          return badRequest('account_id and account_name are required');
        }
        const result = await scanCtrl.triggerScan({
          account_id: body.account_id,
          account_name: body.account_name,
        });
        return created({ data: result });
      }

      // GET /api/scans
      if (method === 'GET' && !subId) {
        const data = await scanCtrl.listScans();
        return ok({ data, count: data.length });
      }

      // GET /api/scans/:scan_id
      if (method === 'GET' && subId && !subAction) {
        const data = await scanCtrl.getScan(subId);
        if (!data) return notFound(`Scan not found: ${subId}`);
        return ok({ data });
      }
    }

    // ── Findings ────────────────────────────────────────────────────────────

    if (resource === 'findings') {
      const roleId = segments[1]; // URL-decoded role ARN (may contain ':' and '/')
      const action = segments[2]; // 'approve' | 'reject' | 'rollback'

      // GET /api/findings
      if (method === 'GET' && !roleId) {
        const filters: findingCtrl.FindingFilters = {};
        if (qs.scan_id) filters.scan_id = qs.scan_id;
        if (qs.review_decision) filters.review_decision = qs.review_decision as findingCtrl.FindingFilters['review_decision'];
        if (qs.risk_level) filters.risk_level = qs.risk_level as findingCtrl.FindingFilters['risk_level'];
        if (qs.account_id) filters.account_id = qs.account_id;

        const data = await findingCtrl.listFindings(filters);
        return ok({ data, count: data.length });
      }

      // GET /api/findings/:id  (requires ?scan_id= query param)
      if (method === 'GET' && roleId && !action) {
        if (!qs.scan_id) return badRequest('scan_id query parameter is required');
        const data = await findingCtrl.getFinding(qs.scan_id, roleId);
        if (!data) return notFound(`Finding not found for role: ${roleId}`);
        return ok({ data });
      }

      // PATCH /api/findings/:id/approve
      if (method === 'PATCH' && roleId && action === 'approve') {
        const body = parseBody<findingCtrl.ApproveRequest>(event.body);
        if (!body.scan_id) return badRequest('scan_id is required in request body');
        if (!body.reviewed_by) return badRequest('reviewed_by is required');

        const { finding, error } = await findingCtrl.approveFinding(roleId, body);
        if (error) {
          if (error.code === 'NOT_FOUND') return notFound(error.message);
          if (error.code === 'SIMULATION_INCOMPLETE') return badRequest(error.message);
          return conflict(error.message);
        }
        return ok({ data: finding });
      }

      // PATCH /api/findings/:id/reject
      if (method === 'PATCH' && roleId && action === 'reject') {
        const body = parseBody<findingCtrl.RejectRequest>(event.body);
        if (!body.scan_id) return badRequest('scan_id is required in request body');
        if (!body.reviewed_by) return badRequest('reviewed_by is required');

        const { finding, error } = await findingCtrl.rejectFinding(roleId, body);
        if (error) {
          if (error.code === 'NOT_FOUND') return notFound(error.message);
          return conflict(error.message);
        }
        return ok({ data: finding });
      }

      // POST /api/findings/:id/rollback
      if (method === 'POST' && roleId && action === 'rollback') {
        const body = parseBody<findingCtrl.RollbackRequest>(event.body);
        if (!body.scan_id) return badRequest('scan_id is required in request body');
        if (!body.rolled_back_by) return badRequest('rolled_back_by is required');

        const { finding, error } = await findingCtrl.rollbackFinding(roleId, body);
        if (error) {
          if (error.code === 'NOT_FOUND') return notFound(error.message);
          return conflict(error.message);
        }
        return ok({ data: finding });
      }
    }

    // ── Dashboard ───────────────────────────────────────────────────────────

    if (resource === 'dashboard') {
      const subResource = segments[1]; // 'metrics' | 'health'

      // GET /api/dashboard/metrics
      if (method === 'GET' && subResource === 'metrics') {
        const data = await dashboardCtrl.getDashboardMetrics();
        if (!data) return notFound('No scan data found');
        return ok({ data });
      }

      // GET /api/dashboard/health
      if (method === 'GET' && subResource === 'health') {
        const data = await dashboardCtrl.getHealthHistory(qs.account_id);
        if (!data) return notFound('No account data found');
        return ok({ data });
      }
    }

    // ── Reports ─────────────────────────────────────────────────────────────

    if (resource === 'reports') {
      const subResource = segments[1]; // 'latest' | 'generate' | undefined

      // GET /api/reports/latest
      if (method === 'GET' && subResource === 'latest') {
        const data = await reportCtrl.getLatestReport();
        if (!data) return notFound('No reports found');
        return ok({ data });
      }

      // GET /api/reports
      if (method === 'GET' && !subResource) {
        const data = await reportCtrl.listReports();
        return ok({ data, count: data.length });
      }

      // POST /api/reports/generate
      if (method === 'POST' && subResource === 'generate') {
        const body = parseBody<reportCtrl.GenerateReportRequest>(event.body);
        const { scan, error } = await reportCtrl.generateReport(body);
        if (error) {
          if (error.code === 'NOT_FOUND' || error.code === 'NO_FINDINGS') {
            return notFound(error.message);
          }
          return serverError(error.message);
        }
        return created({ data: scan });
      }
    }

    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Route not found' }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error(
      JSON.stringify({ handler: 'apiHandler', error: message, method, rawPath })
    );
    return serverError(message);
  }
};
