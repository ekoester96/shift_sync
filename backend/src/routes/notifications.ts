import { Router, Response } from 'express';
import pool from '../dbConfig';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// ─── Manager/Admin Notifications ─────────────────────────────────────────────
router.get('/manager', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;
    const notifications: any[] = [];

    // Pending PTO requests
    const pendingPto = await pool.query(
      `SELECT pr.pto_request_id AS id, e.employee_name, pr.request_type,
              TO_CHAR(pr.start_date, 'Mon DD, YYYY') AS start_date,
              TO_CHAR(pr.end_date, 'Mon DD, YYYY') AS end_date,
              pr.created_at
       FROM pto_requests pr
       JOIN employee e ON pr.employee_id = e.employee_id
       WHERE e.business_id = $1 AND pr.status = 'pending'
       ORDER BY pr.created_at DESC`,
      [bid]
    );

    for (const r of pendingPto.rows) {
      notifications.push({
        id: `pto-${r.id}`,
        type: 'pto_pending',
        icon: 'calendar',
        title: 'PTO Request',
        message: `${r.employee_name} requested ${r.request_type} (${r.start_date} – ${r.end_date})`,
        time: r.created_at,
        actionUrl: 'approvals',
      });
    }

    // Pending shift swap requests
    const pendingSwaps = await pool.query(
      `SELECT ss.shift_swap_id AS id, ss.requester_employee_name, ss.target_employee_name,
              ss.created_at
       FROM shift_swaps ss
       JOIN employee e ON ss.requester_employee_id = e.employee_id
       WHERE e.business_id = $1 AND ss.shift_swap_status = 'pending'
       ORDER BY ss.created_at DESC`,
      [bid]
    );

    for (const r of pendingSwaps.rows) {
      notifications.push({
        id: `swap-${r.id}`,
        type: 'swap_pending',
        icon: 'swap',
        title: 'Shift Swap Request',
        message: `${r.requester_employee_name} wants to swap with ${r.target_employee_name}`,
        time: r.created_at,
        actionUrl: 'approvals',
      });
    }

    // Shifts claimed by employees (pending approval)
    const claimedShifts = await pool.query(
      `SELECT s.shift_id, e.employee_name, s.position,
              TO_CHAR(s.start_date, 'Mon DD, YYYY') AS shift_date,
              TO_CHAR(s.start_time, 'HH24:MI') AS start_time,
              TO_CHAR(s.end_time, 'HH24:MI') AS end_time
       FROM shifts s
       JOIN employee e ON s.employee_id = e.employee_id
       WHERE e.business_id = $1 AND s.status = 'pending'
       AND s.scheduled_by IS NOT NULL`,
      [bid]
    );

    for (const r of claimedShifts.rows) {
      notifications.push({
        id: `claim-${r.shift_id}`,
        type: 'shift_claimed',
        icon: 'user',
        title: 'Shift Claimed',
        message: `${r.employee_name} claimed the ${r.position} shift on ${r.shift_date}`,
        time: null,
        actionUrl: 'schedule',
      });
    }

    // Sort by time (newest first), nulls at end
    notifications.sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return new Date(b.time).getTime() - new Date(a.time).getTime();
    });

    res.json({
      count: notifications.length,
      notifications: notifications.slice(0, 20),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Manager notifications error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Employee Notifications ──────────────────────────────────────────────────
router.get('/employee', async (req: AuthRequest, res: Response) => {
  try {
    const empId = req.user!.employee_id;
    const bid = req.user!.business_id;
    const notifications: any[] = [];

    if (!empId) {
      res.json({ count: 0, notifications: [] });
      return;
    }

    // PTO approved/denied (last 30 days)
    const ptoUpdates = await pool.query(
      `SELECT pr.pto_request_id AS id, pr.request_type, pr.status,
              TO_CHAR(pr.start_date, 'Mon DD, YYYY') AS start_date,
              pr.approved_at, pr.updated_at
       FROM pto_requests pr
       WHERE pr.employee_id = $1
       AND pr.status IN ('approved', 'denied')
       AND (pr.approved_at >= NOW() - INTERVAL '30 days'
            OR pr.updated_at >= NOW() - INTERVAL '30 days')
       ORDER BY COALESCE(pr.approved_at, pr.updated_at) DESC`,
      [empId]
    );

    for (const r of ptoUpdates.rows) {
      notifications.push({
        id: `pto-${r.id}`,
        type: r.status === 'approved' ? 'pto_approved' : 'pto_denied',
        icon: r.status === 'approved' ? 'check' : 'x',
        title: `PTO ${r.status === 'approved' ? 'Approved' : 'Denied'}`,
        message: `Your ${r.request_type} request for ${r.start_date} was ${r.status}`,
        time: r.approved_at || r.updated_at,
      });
    }

    // Shift swap approved/denied (last 30 days)
    const swapUpdates = await pool.query(
      `SELECT ss.shift_swap_id AS id, ss.target_employee_name, ss.shift_swap_status AS status,
              ss.approved_at, ss.updated_at
       FROM shift_swaps ss
       WHERE ss.requester_employee_id = $1
       AND ss.shift_swap_status IN ('approved', 'denied')
       AND (ss.approved_at >= NOW() - INTERVAL '30 days'
            OR ss.updated_at >= NOW() - INTERVAL '30 days')
       ORDER BY COALESCE(ss.approved_at, ss.updated_at) DESC`,
      [empId]
    );

    for (const r of swapUpdates.rows) {
      notifications.push({
        id: `swap-${r.id}`,
        type: r.status === 'approved' ? 'swap_approved' : 'swap_denied',
        icon: r.status === 'approved' ? 'check' : 'x',
        title: `Swap ${r.status === 'approved' ? 'Approved' : 'Denied'}`,
        message: `Your swap request with ${r.target_employee_name} was ${r.status}`,
        time: r.approved_at || r.updated_at,
      });
    }

    // Upcoming shifts (next 48 hours)
    const upcoming = await pool.query(
      `SELECT s.shift_id, s.position,
              TO_CHAR(s.start_date, 'Mon DD, YYYY') AS shift_date,
              TO_CHAR(s.start_time, 'HH24:MI') AS start_time,
              TO_CHAR(s.end_time, 'HH24:MI') AS end_time
       FROM shifts s
       WHERE s.employee_id = $1
       AND s.start_date >= CURRENT_DATE
       AND s.start_date <= CURRENT_DATE + 2
       AND s.status = 'confirmed'
       ORDER BY s.start_date, s.start_time`,
      [empId]
    );

    for (const r of upcoming.rows) {
      notifications.push({
        id: `shift-${r.shift_id}`,
        type: 'upcoming_shift',
        icon: 'clock',
        title: 'Upcoming Shift',
        message: `${r.position} on ${r.shift_date} (${r.start_time}–${r.end_time})`,
        time: null,
      });
    }

    // Open shifts available
    const openShifts = await pool.query(
      `SELECT COUNT(*) AS cnt FROM shifts s
       WHERE s.employee_id IS NULL AND s.status = 'open'
       AND s.start_date >= CURRENT_DATE
       AND s.scheduled_by IN (SELECT employee_id FROM employee WHERE business_id = $1)`,
      [bid]
    );

    if (parseInt(openShifts.rows[0].cnt) > 0) {
      const cnt = parseInt(openShifts.rows[0].cnt);
      notifications.push({
        id: 'open-shifts',
        type: 'open_shifts',
        icon: 'plus',
        title: 'Open Shifts Available',
        message: `${cnt} open shift${cnt > 1 ? 's' : ''} you can claim`,
        time: null,
        actionUrl: 'open-shifts',
      });
    }

    notifications.sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return new Date(b.time).getTime() - new Date(a.time).getTime();
    });

    res.json({
      count: notifications.length,
      notifications: notifications.slice(0, 20),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Employee notifications error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
