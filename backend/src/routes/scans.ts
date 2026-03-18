/**
 * IAM Drift Intelligence — Scan Routes (Express, local dev only)
 *
 * Thin wrapper around scanController. These routes mirror the Lambda handler
 * routing exactly. In production, API Gateway routes to the ApiHandler Lambda.
 */

import { Router, Request, Response } from 'express';
import * as ctrl from '../controllers/scanController';
import { triggerManualScan } from '../controllers/coordinatorController';

const router = Router();

// GET /api/scans
router.get('/', async (_req: Request, res: Response) => {
  const data = await ctrl.listScans();
  res.json({ data, count: data.length });
});

// GET /api/scans/:scan_id
router.get('/:scan_id', async (req: Request, res: Response) => {
  const data = await ctrl.getScan(req.params.scan_id);
  if (!data) return res.status(404).json({ error: 'Scan not found' });
  res.json({ data });
});

// POST /api/scans/trigger
router.post('/trigger', async (req: Request, res: Response) => {
  const { account_id, account_name } = req.body ?? {};
  if (!account_id || !account_name) {
    return res.status(400).json({ error: 'account_id and account_name are required' });
  }
  const result = await triggerManualScan({ account_id, account_name });
  res.status(202).json({ data: result });
});

export default router;
