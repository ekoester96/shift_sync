import { Router, Response } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

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

// ═══════════════════════════════════════════════════════════════════
// BUSINESS ADMIN / MANAGER ROUTES (read-only analytics)
// No training allowed — training is done via ops admin or CLI
// ═══════════════════════════════════════════════════════════════════
router.use(authenticateToken);

// ─── Model Info (read-only) ──────────────────────────────────────────────────
router.get('/model/info', requireRole('admin', 'manager'), async (_req: AuthRequest, res: Response) => {
  try {
    const result = await mlFetch('/model/info');
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ML service unavailable';
    res.status(500).json({ error: message });
  }
});

// ─── Attendance Trends (read-only) ───────────────────────────────────────────
router.get('/analytics/attendance-trends', requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const days = req.query.days || 30;
    const result = await mlFetch(`/analytics/attendance-trends?business_id=${req.user!.business_id}&days=${days}`);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ML service unavailable';
    res.status(500).json({ error: message });
  }
});

// ─── Risk Employees (read-only) ──────────────────────────────────────────────
router.get('/analytics/risk-employees', requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const days = req.query.days || 30;
    const result = await mlFetch(`/analytics/risk-employees?business_id=${req.user!.business_id}&days=${days}`);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ML service unavailable';
    res.status(500).json({ error: message });
  }
});

// ─── View Predictions (read-only — uses last trained model) ──────────────────
router.post('/predict', requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as any;
    const result = await mlFetch('/predict', {
      method: 'POST',
      body: JSON.stringify({
        business_id: req.user!.business_id,
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

export default router;