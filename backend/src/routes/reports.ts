/**
 * IAM Drift Intelligence — Report Routes (Express, local dev only)
 */

import { Router, Request, Response } from 'express';
import * as ctrl from '../controllers/reportController';

const router = Router();

// GET /api/reports/latest  (must be before /:scan_id)
router.get('/latest', async (_req: Request, res: Response) => {
  const data = await ctrl.getLatestReport();
  if (!data) return res.status(404).json({ error: 'No reports found' });
  res.json({ data });
});

// GET /api/reports
router.get('/', async (_req: Request, res: Response) => {
  const data = await ctrl.listReports();
  res.json({ data, count: data.length });
});

// POST /api/reports/generate
router.post('/generate', async (req: Request, res: Response) => {
  const { scan_id } = req.body ?? {};
  const { scan, error } = await ctrl.generateReport({ scan_id });
  if (error) {
    if (error.code === 'NOT_FOUND' || error.code === 'NO_FINDINGS') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(502).json({ error: error.message });
  }
  res.status(201).json({ data: scan });
});

export default router;
