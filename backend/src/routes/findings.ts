/**
 * IAM Drift Intelligence — Finding Routes (Express, local dev only)
 *
 * Thin wrapper around findingController. The ':id' parameter is a URL-encoded
 * role ARN — Express automatically URL-decodes it via req.params.id.
 */

import { Router, Request, Response } from 'express';
import * as ctrl from '../controllers/findingController';
import { RiskLevel, ReviewDecision } from '../types';

const router = Router();

// GET /api/findings
router.get('/', async (req: Request, res: Response) => {
  const filters: ctrl.FindingFilters = {};
  if (req.query.scan_id) filters.scan_id = String(req.query.scan_id);
  if (req.query.review_decision) filters.review_decision = String(req.query.review_decision) as ReviewDecision;
  if (req.query.risk_level) filters.risk_level = String(req.query.risk_level) as RiskLevel;
  if (req.query.account_id) filters.account_id = String(req.query.account_id);

  const data = await ctrl.listFindings(filters);
  res.json({ data, count: data.length });
});

// GET /api/findings/:id   (?scan_id= required)
router.get('/:id', async (req: Request, res: Response) => {
  const roleId = req.params.id;
  const scanId = String(req.query.scan_id ?? '');
  if (!scanId) return res.status(400).json({ error: 'scan_id query parameter is required' });

  const data = await ctrl.getFinding(scanId, roleId);
  if (!data) return res.status(404).json({ error: 'Finding not found' });
  res.json({ data });
});

// PATCH /api/findings/:id/approve
router.patch('/:id/approve', async (req: Request, res: Response) => {
  const roleId = req.params.id;
  const { scan_id, reviewed_by, review_notes } = req.body ?? {};
  if (!scan_id) return res.status(400).json({ error: 'scan_id is required' });
  if (!reviewed_by) return res.status(400).json({ error: 'reviewed_by is required' });

  const { finding, error } = await ctrl.approveFinding(roleId, { scan_id, reviewed_by, review_notes });
  if (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: error.message });
    if (error.code === 'SIMULATION_INCOMPLETE') return res.status(400).json({ error: error.message });
    return res.status(409).json({ error: error.message });
  }
  res.json({ data: finding });
});

// PATCH /api/findings/:id/reject
router.patch('/:id/reject', async (req: Request, res: Response) => {
  const roleId = req.params.id;
  const { scan_id, reviewed_by, review_notes } = req.body ?? {};
  if (!scan_id) return res.status(400).json({ error: 'scan_id is required' });
  if (!reviewed_by) return res.status(400).json({ error: 'reviewed_by is required' });

  const { finding, error } = await ctrl.rejectFinding(roleId, { scan_id, reviewed_by, review_notes });
  if (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: error.message });
    return res.status(409).json({ error: error.message });
  }
  res.json({ data: finding });
});

// POST /api/findings/:id/rollback
router.post('/:id/rollback', async (req: Request, res: Response) => {
  const roleId = req.params.id;
  const { scan_id, rolled_back_by } = req.body ?? {};
  if (!scan_id) return res.status(400).json({ error: 'scan_id is required' });
  if (!rolled_back_by) return res.status(400).json({ error: 'rolled_back_by is required' });

  const { finding, error } = await ctrl.rollbackFinding(roleId, { scan_id, rolled_back_by });
  if (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: error.message });
    return res.status(409).json({ error: error.message });
  }
  res.json({ data: finding });
});

export default router;
