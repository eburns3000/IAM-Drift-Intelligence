/**
 * IAM Drift Intelligence — Dashboard Routes (Express, local dev only)
 */

import { Router, Request, Response } from 'express';
import * as ctrl from '../controllers/dashboardController';

const router = Router();

// GET /api/dashboard/metrics
router.get('/metrics', async (_req: Request, res: Response) => {
  const data = await ctrl.getDashboardMetrics();
  if (!data) return res.status(404).json({ error: 'No scan data found' });
  res.json({ data });
});

// GET /api/dashboard/health
router.get('/health', async (req: Request, res: Response) => {
  const accountId = req.query.account_id ? String(req.query.account_id) : undefined;
  const data = await ctrl.getHealthHistory(accountId);
  if (!data) return res.status(404).json({ error: 'No account data found' });
  res.json({ data });
});

export default router;
