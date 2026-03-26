import { Router, Request, Response } from 'express';
import pool from '../dbConfig';

const router = Router();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// ─── Proxy helper ────────────────────────────────────────────────────────────
async function mlFetch(path: string, options: { method?: string; body?: string } = {}): Promise<any> {
  const res = await fetch(`${ML_SERVICE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err.detail || `ML service error: ${res.status}`);
  }
  return res.json();
}

// Note: These routes should be mounted under your ops auth middleware
// e.g. app.use('/api/ops/ml', opsAuthMiddleware, opsMlRouter);

// ─── List All Businesses (for dropdown) ──────────────────────────────────────
router.get('/businesses', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT b.business_id, b.business_name, b.is_active,
             (SELECT COUNT(*) FROM employee e WHERE e.business_id = b.business_id) AS employee_count,
             (SELECT COUNT(*) FROM shifts s
              JOIN employee e2 ON s.employee_id = e2.employee_id
              WHERE e2.business_id = b.business_id
              AND s.attendance_status IS NOT NULL) AS shift_records
      FROM businesses b
      ORDER BY b.business_name
    `);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── ML Health Check ─────────────────────────────────────────────────────────
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const result = await mlFetch('/health');
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ML service unavailable';
    res.status(500).json({ error: message, status: 'offline' });
  }
});

// ─── Model Info ──────────────────────────────────────────────────────────────
router.get('/model/info', async (_req: Request, res: Response) => {
  try {
    const result = await mlFetch('/model/info');
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ML service unavailable';
    res.status(500).json({ error: message });
  }
});

// ─── Train Model (ops admin only) ────────────────────────────────────────────
router.post('/train', async (req: Request, res: Response) => {
  try {
    const businessId = (req.body as any).business_id || (req.query.business_id as string);
    if (!businessId) {
      res.status(400).json({ error: 'business_id is required' });
      return;
    }
    const result = await mlFetch(`/train?business_id=${businessId}`, { method: 'POST' });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ML service unavailable';
    res.status(500).json({ error: message });
  }
});

// ─── Run Prediction (ops admin) ──────────────────────────────────────────────
router.post('/predict', async (req: Request, res: Response) => {
  try {
    const body = req.body as any;
    if (!body.business_id || !body.date) {
      res.status(400).json({ error: 'business_id and date are required' });
      return;
    }
    const result = await mlFetch('/predict', {
      method: 'POST',
      body: JSON.stringify({
        business_id: body.business_id,
        date: body.date,
        employee_ids: body.employee_ids,
      }),
    });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ML service unavailable';
    res.status(500).json({ error: message });
  }
});

// ─── Attendance Trends (ops admin — any business) ────────────────────────────
router.get('/analytics/attendance-trends', async (req: Request, res: Response) => {
  try {
    const businessId = req.query.business_id as string;
    const days = req.query.days || 30;
    if (!businessId) {
      res.status(400).json({ error: 'business_id is required' });
      return;
    }
    const result = await mlFetch(`/analytics/attendance-trends?business_id=${businessId}&days=${days}`);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ML service unavailable';
    res.status(500).json({ error: message });
  }
});

// ─── Risk Employees (ops admin — any business) ──────────────────────────────
router.get('/analytics/risk-employees', async (req: Request, res: Response) => {
  try {
    const businessId = req.query.business_id as string;
    const days = req.query.days || 30;
    if (!businessId) {
      res.status(400).json({ error: 'business_id is required' });
      return;
    }
    const result = await mlFetch(`/analytics/risk-employees?business_id=${businessId}&days=${days}`);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ML service unavailable';
    res.status(500).json({ error: message });
  }
});

export default router;
