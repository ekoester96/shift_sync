import { Router, Response } from 'express';
import pool from '../dbConfig';
import { Pool } from 'pg';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { shiftDurationHoursSql } from '../utils/shiftDurationSql';

const router = Router();
const GRACE_PERIOD_MINUTES = 5;
const GRACE_PERIOD_MS = GRACE_PERIOD_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SHIFT_DURATION_HOURS_SQL = shiftDurationHoursSql('s');
const SHIFT_DURATION_HOURS_UNALIASED_SQL = shiftDurationHoursSql();

router.use(authenticateToken, requireRole('admin', 'manager', 'employee'));

// Helper: resolve the employee ID from the token, or fallback for admin
async function getEmployeeId(req: AuthRequest, pgPool: Pool): Promise<number | null> {
  // Employee/manager — use their real ID from the token
  if (req.user!.employee_id) {
    return req.user!.employee_id;
  }
  // Admin viewing employee view — fall back to first employee in business
  const result = await pgPool.query(
    'SELECT employee_id FROM employee WHERE business_id = $1 ORDER BY employee_id LIMIT 1',
    [req.user!.business_id]
  );
  return result.rows.length > 0 ? result.rows[0].employee_id : null;
}

function normalizeTimeString(value: string): string {
  return value.length === 5 ? `${value}:00` : value.slice(0, 8);
}

function buildShiftDateTime(shiftDate: string, timeValue: string): Date {
  return new Date(`${shiftDate}T${normalizeTimeString(timeValue)}`);
}

function formatSqlTime(date: Date): string {
  return date.toTimeString().split(' ')[0];
}

function formatDisplayTime(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 5);
}

function buildClockState(rawShift: any, now: Date = new Date()) {
  const shiftDate = String(rawShift.shift_date).slice(0, 10);
  const scheduledStart = buildShiftDateTime(shiftDate, String(rawShift.start_time));
  let scheduledEnd = buildShiftDateTime(shiftDate, String(rawShift.end_time));
  if (scheduledEnd.getTime() <= scheduledStart.getTime()) {
    scheduledEnd = new Date(scheduledEnd.getTime() + DAY_MS);
  }

  const actualStartRaw = rawShift.actual_start_time ? String(rawShift.actual_start_time) : null;
  const actualEndRaw = rawShift.actual_end_time ? String(rawShift.actual_end_time) : null;
  const actualStart = actualStartRaw ? buildShiftDateTime(shiftDate, actualStartRaw) : null;
  let actualEnd = actualEndRaw ? buildShiftDateTime(shiftDate, actualEndRaw) : null;

  if (actualEnd && actualStart && actualEnd.getTime() < actualStart.getTime()) {
    actualEnd = new Date(actualEnd.getTime() + DAY_MS);
  } else if (actualEnd && actualEnd.getTime() < scheduledStart.getTime()) {
    actualEnd = new Date(actualEnd.getTime() + DAY_MS);
  }

  const clockInWindowStart = new Date(scheduledStart.getTime() - GRACE_PERIOD_MS);
  const clockInGraceEnd = new Date(scheduledStart.getTime() + GRACE_PERIOD_MS);
  const clockOutGraceStart = new Date(scheduledEnd.getTime() - GRACE_PERIOD_MS);
  const clockOutGraceEnd = new Date(scheduledEnd.getTime() + GRACE_PERIOD_MS);

  let clockInStatus: string;
  if (actualStart) {
    if (actualStart.getTime() > clockInGraceEnd.getTime()) clockInStatus = 'late';
    else if (actualStart.getTime() < clockInWindowStart.getTime()) clockInStatus = 'early';
    else clockInStatus = 'on_time';
  } else if (now.getTime() < clockInWindowStart.getTime()) {
    clockInStatus = 'not_open';
  } else if (now.getTime() <= clockInGraceEnd.getTime()) {
    clockInStatus = 'on_time_window';
  } else if (now.getTime() <= clockOutGraceEnd.getTime()) {
    clockInStatus = 'late';
  } else {
    clockInStatus = 'missed';
  }

  let clockOutStatus: string;
  if (!actualStart) {
    clockOutStatus = 'clock_in_required';
  } else if (actualEnd) {
    if (actualEnd.getTime() < clockOutGraceStart.getTime()) clockOutStatus = 'early';
    else if (actualEnd.getTime() > clockOutGraceEnd.getTime()) clockOutStatus = 'late';
    else clockOutStatus = 'on_time';
  } else if (now.getTime() < clockOutGraceStart.getTime()) {
    clockOutStatus = 'not_open';
  } else if (now.getTime() <= clockOutGraceEnd.getTime()) {
    clockOutStatus = 'on_time_window';
  } else {
    clockOutStatus = 'late';
  }

  return {
    ...rawShift,
    actual_start_time: formatDisplayTime(actualStartRaw),
    actual_end_time: formatDisplayTime(actualEndRaw),
    has_clocked_in: Boolean(actualStart),
    has_clocked_out: Boolean(actualEnd),
    can_clock_in: !actualStart && now.getTime() >= clockInWindowStart.getTime() && now.getTime() <= clockOutGraceEnd.getTime(),
    can_clock_out: Boolean(actualStart) && !actualEnd,
    clock_in_status: clockInStatus,
    clock_out_status: clockOutStatus,
    clock_in_window_start: clockInWindowStart.toISOString(),
    clock_in_window_end: clockInGraceEnd.toISOString(),
    clock_out_window_start: clockOutGraceStart.toISOString(),
    clock_out_window_end: clockOutGraceEnd.toISOString(),
    scheduled_start_at: scheduledStart.toISOString(),
    scheduled_end_at: scheduledEnd.toISOString(),
    grace_period_minutes: GRACE_PERIOD_MINUTES,
  };
}

async function getEmployeeShiftState(pgPool: Pool, employeeId: number, shiftId: number) {
  const result = await pgPool.query(
    `SELECT shift_id, employee_id,
            TO_CHAR(start_date, 'YYYY-MM-DD') AS shift_date,
            TO_CHAR(start_time, 'HH24:MI') AS start_time,
            TO_CHAR(end_time, 'HH24:MI') AS end_time,
            TO_CHAR(actual_start_time, 'HH24:MI:SS') AS actual_start_time,
            TO_CHAR(actual_end_time, 'HH24:MI:SS') AS actual_end_time,
            attendance_status,
            position, status
     FROM shifts
     WHERE shift_id = $1
       AND employee_id = $2
       AND status != 'cancelled'`,
    [shiftId, employeeId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return buildClockState(result.rows[0]);
}

// ─── Employee Dashboard Stats ────────────────────────────────────────────────
router.get('/dashboard/stats', async (req: AuthRequest, res: Response) => {
  try {
    const empId = await getEmployeeId(req, pool);
    if (!empId) { res.json({ shifts_this_week: 0, pending_swaps: 0 }); return; }

    const shiftsWeek = await pool.query(
      `SELECT COUNT(*) AS cnt FROM shifts
       WHERE employee_id = $1
       AND start_date >= CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int
       AND start_date < CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int + 7`,
      [empId]
    );

    const hoursWeek = await pool.query(
      `SELECT COALESCE(SUM(${SHIFT_DURATION_HOURS_UNALIASED_SQL}), 0) AS hrs FROM shifts
       WHERE employee_id = $1
       AND start_date >= CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int
       AND start_date < CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int + 7`,
      [empId]
    );

    const pendingSwaps = await pool.query(
      `SELECT COUNT(*) AS cnt FROM shift_swaps
       WHERE requester_employee_id = $1 AND shift_swap_status = 'pending'`,
      [empId]
    );

    const pendingPto = await pool.query(
      `SELECT COUNT(*) AS cnt FROM pto_requests
       WHERE employee_id = $1 AND status = 'pending'`,
      [empId]
    );

    res.json({
      shifts_this_week: parseInt(shiftsWeek.rows[0].cnt),
      hours_this_week: hoursWeek.rows[0].hrs,
      pending_swaps: parseInt(pendingSwaps.rows[0].cnt),
      pending_pto: parseInt(pendingPto.rows[0].cnt),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Employee stats error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Upcoming Shifts ─────────────────────────────────────────────────────────
router.get('/shifts/upcoming', async (req: AuthRequest, res: Response) => {
  try {
    const empId = await getEmployeeId(req, pool);
    if (!empId) { res.json([]); return; }

    const result = await pool.query(
      `SELECT shift_id, employee_id,
              TO_CHAR(start_date, 'YYYY-MM-DD') AS shift_date,
              TO_CHAR(start_time, 'HH24:MI') AS start_time,
              TO_CHAR(end_time, 'HH24:MI') AS end_time,
              TO_CHAR(actual_start_time, 'HH24:MI:SS') AS actual_start_time,
              TO_CHAR(actual_end_time, 'HH24:MI:SS') AS actual_end_time,
              attendance_status,
              position, status
       FROM shifts
       WHERE employee_id = $1
         AND start_date >= CURRENT_DATE - 1
       ORDER BY start_date, start_time`,
      [empId]
    );

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const shifts = result.rows
      .map((shift) => buildClockState(shift))
      .filter((shift) => new Date(shift.scheduled_end_at).getTime() >= startOfToday.getTime());

    res.json(shifts);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Upcoming shifts error:', message);
    res.status(500).json({ error: message });
  }
});

router.post('/shifts/:id/clock-in', async (req: AuthRequest, res: Response) => {
  try {
    const shiftId = parseInt(String(req.params.id), 10);
    if (isNaN(shiftId)) {
      res.status(400).json({ error: 'Invalid shift ID.' });
      return;
    }
    if (req.user!.role !== 'employee') {
      res.status(403).json({ error: 'Only employees can clock in.' });
      return;
    }

    const empId = await getEmployeeId(req, pool);
    if (!empId) {
      res.status(404).json({ error: 'Employee not found.' });
      return;
    }

    const shift = await getEmployeeShiftState(pool, empId, shiftId);
    if (!shift) {
      res.status(404).json({ error: 'Shift not found.' });
      return;
    }
    if (shift.has_clocked_in) {
      res.status(409).json({ error: 'You have already clocked in for this shift.' });
      return;
    }
    if (!shift.can_clock_in) {
      const error = shift.clock_in_status === 'not_open'
        ? `Clock-in opens ${GRACE_PERIOD_MINUTES} minutes before the scheduled start time.`
        : 'This shift can no longer be clocked in.';
      res.status(400).json({ error });
      return;
    }

    const now = new Date();
    const attendanceStatus = shift.clock_in_status === 'late' ? 'late' : 'worked';
    const update = await pool.query(
      `UPDATE shifts
       SET actual_start_time = $1::TIME,
           attendance_status = $2
       WHERE shift_id = $3
         AND employee_id = $4
         AND actual_start_time IS NULL`,
      [formatSqlTime(now), attendanceStatus, shiftId, empId]
    );

    if (!update.rowCount) {
      res.status(409).json({ error: 'This shift was already clocked in from another session.' });
      return;
    }

    const updatedShift = await getEmployeeShiftState(pool, empId, shiftId);
    res.json({
      success: true,
      message: attendanceStatus === 'late' ? 'Clocked in late.' : 'Clocked in on time.',
      shift: updatedShift,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Clock-in error:', message);
    res.status(500).json({ error: message });
  }
});

router.post('/shifts/:id/clock-out', async (req: AuthRequest, res: Response) => {
  try {
    const shiftId = parseInt(String(req.params.id), 10);
    if (isNaN(shiftId)) {
      res.status(400).json({ error: 'Invalid shift ID.' });
      return;
    }
    if (req.user!.role !== 'employee') {
      res.status(403).json({ error: 'Only employees can clock out.' });
      return;
    }

    const empId = await getEmployeeId(req, pool);
    if (!empId) {
      res.status(404).json({ error: 'Employee not found.' });
      return;
    }

    const shift = await getEmployeeShiftState(pool, empId, shiftId);
    if (!shift) {
      res.status(404).json({ error: 'Shift not found.' });
      return;
    }
    if (!shift.has_clocked_in) {
      res.status(409).json({ error: 'Clock in before you clock out.' });
      return;
    }
    if (shift.has_clocked_out) {
      res.status(409).json({ error: 'You have already clocked out for this shift.' });
      return;
    }

    const now = new Date();
    const update = await pool.query(
      `UPDATE shifts
       SET actual_end_time = $1::TIME
       WHERE shift_id = $2
         AND employee_id = $3
         AND actual_start_time IS NOT NULL
         AND actual_end_time IS NULL`,
      [formatSqlTime(now), shiftId, empId]
    );

    if (!update.rowCount) {
      res.status(409).json({ error: 'This shift was already clocked out from another session.' });
      return;
    }

    const updatedShift = await getEmployeeShiftState(pool, empId, shiftId);
    const timing = shift.clock_out_status === 'late'
      ? 'late'
      : shift.clock_out_status === 'not_open'
        ? 'early'
        : 'on_time';

    res.json({
      success: true,
      message: timing === 'early'
        ? 'Clocked out early.'
        : timing === 'late'
          ? 'Clocked out outside the grace window.'
          : 'Clocked out on time.',
      shift: updatedShift,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Clock-out error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Schedule: Weekly ────────────────────────────────────────────────────────
router.get('/schedule/weekly', async (req: AuthRequest, res: Response) => {
  try {
    const empId = req.user!.employee_id;

    const today = new Date();
    const dayOfWeek = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    const days = [];
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      days.push({
        weekday: weekdays[i],
        date: d.getDate().toString(),
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        iso: d.toISOString().split('T')[0],
      });
    }

    const shifts = await pool.query(
      `SELECT s.shift_id, s.employee_id,
              TO_CHAR(s.start_date, 'YYYY-MM-DD') AS shift_date,
              TO_CHAR(s.start_time, 'HH24:MI') AS start_time,
              TO_CHAR(s.end_time, 'HH24:MI') AS end_time,
              s.position, s.status
       FROM shifts s
       WHERE s.employee_id = $1
       AND s.start_date >= $2 AND s.start_date <= $3
       ORDER BY s.start_date, s.start_time`,
      [empId, days[0].iso, days[6].iso]
    );

    const hoursResult = await pool.query(
      `SELECT COALESCE(SUM(${SHIFT_DURATION_HOURS_SQL}), 0) AS total_hours
       FROM shifts s
       WHERE s.employee_id = $1
       AND s.start_date >= $2 AND s.start_date <= $3`,
      [empId, days[0].iso, days[6].iso]
    );

    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const weekLabel = `${mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    res.json({
      week_label: weekLabel,
      days,
      shifts: shifts.rows,
      total_hours: parseFloat(hoursResult.rows[0].total_hours).toFixed(1),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Employee weekly schedule error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Schedule: Monthly ───────────────────────────────────────────────────────
router.get('/schedule/monthly', async (req: AuthRequest, res: Response) => {
  try {
    const empId = req.user!.employee_id;
    const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();
    const month = parseInt(req.query.month as string, 10) || (new Date().getMonth() + 1);

    const daySummary = await pool.query(
      `SELECT TO_CHAR(s.start_date, 'YYYY-MM-DD') AS shift_date,
              COUNT(*) AS shift_count,
              COALESCE(SUM(${SHIFT_DURATION_HOURS_SQL}), 0) AS total_hours
       FROM shifts s
       WHERE s.employee_id = $1
       AND EXTRACT(YEAR FROM s.start_date) = $2 AND EXTRACT(MONTH FROM s.start_date) = $3
       GROUP BY s.start_date
       ORDER BY s.start_date`,
      [empId, year, month]
    );

    const details = await pool.query(
      `SELECT s.shift_id, s.employee_id,
              TO_CHAR(s.start_date, 'YYYY-MM-DD') AS shift_date,
              TO_CHAR(s.start_time, 'HH24:MI') AS start_time,
              TO_CHAR(s.end_time, 'HH24:MI') AS end_time,
              s.position, s.status
       FROM shifts s
       WHERE s.employee_id = $1
       AND EXTRACT(YEAR FROM s.start_date) = $2 AND EXTRACT(MONTH FROM s.start_date) = $3
       ORDER BY s.start_date, s.start_time`,
      [empId, year, month]
    );

    const monthTotal = await pool.query(
      `SELECT COALESCE(SUM(${SHIFT_DURATION_HOURS_SQL}), 0) AS total_hours
       FROM shifts s
       WHERE s.employee_id = $1
       AND EXTRACT(YEAR FROM s.start_date) = $2 AND EXTRACT(MONTH FROM s.start_date) = $3`,
      [empId, year, month]
    );

    res.json({
      year,
      month,
      days: daySummary.rows,
      shifts: details.rows,
      total_hours: parseFloat(monthTotal.rows[0].total_hours).toFixed(1),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Employee monthly schedule error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── PTO Balance ─────────────────────────────────────────────────────────────
router.get('/pto/balance', async (req: AuthRequest, res: Response) => {
  try {
    const empId = req.user!.employee_id;

    const emp = await pool.query(
      `SELECT COALESCE(pto_balance_hours, 0) AS base_balance,
              COALESCE(pto_accrual_rate, 0) AS accrual_rate
       FROM employee WHERE employee_id = $1`,
      [empId]
    );

    if (emp.rows.length === 0) {
      res.json({ balance: 0, accrual_rate: 0, used_this_year: 0, pending: 0, accrued: 0 });
      return;
    }

    const row = emp.rows[0];

    const pastHours = await pool.query(
      `SELECT COALESCE(SUM(${SHIFT_DURATION_HOURS_SQL}), 0) AS total_hours
       FROM shifts s
       WHERE s.employee_id = $1
       AND s.start_date < CURRENT_DATE`,
      [empId]
    );

    const hoursWorked = parseFloat(pastHours.rows[0].total_hours);
    const accrued = hoursWorked * parseFloat(row.accrual_rate);

    const used = await pool.query(
      `SELECT COALESCE(SUM(end_date::date - start_date::date + 1), 0) * 8 AS used_hours
       FROM pto_requests
       WHERE employee_id = $1 AND status = 'approved'
       AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE)`,
      [empId]
    );

    const pending = await pool.query(
      `SELECT COALESCE(SUM(end_date::date - start_date::date + 1), 0) * 8 AS pending_hours
       FROM pto_requests
       WHERE employee_id = $1 AND status = 'pending'`,
      [empId]
    );

    const usedHours = parseFloat(used.rows[0].used_hours);
    const pendingHours = parseFloat(pending.rows[0].pending_hours);
    const baseBalance = parseFloat(row.base_balance);
    const availableBalance = baseBalance + accrued - usedHours;

    res.json({
      balance: Math.max(availableBalance, 0).toFixed(1),
      base_balance: baseBalance.toFixed(1),
      accrued: accrued.toFixed(1),
      accrual_rate: parseFloat(row.accrual_rate),
      hours_worked: hoursWorked.toFixed(1),
      used_this_year: usedHours.toFixed(1),
      pending: pendingHours.toFixed(1),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('PTO balance error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Coworkers ───────────────────────────────────────────────────────────────
router.get('/coworkers', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT employee_id, employee_name AS name, employee_position AS position
       FROM employee WHERE business_id = $1 ORDER BY employee_name`,
      [req.user!.business_id]
    );
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Coworkers error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Open Shifts (available to claim) ────────────────────────────────────────
router.get('/shifts/open', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;

    const result = await pool.query(
      `SELECT s.shift_id,
              TO_CHAR(s.start_date, 'YYYY-MM-DD') AS shift_date,
              TO_CHAR(s.start_time, 'HH24:MI') AS start_time,
              TO_CHAR(s.end_time, 'HH24:MI') AS end_time,
              s.position
       FROM shifts s
       WHERE s.employee_id IS NULL
       AND s.status = 'open'
       AND s.start_date >= CURRENT_DATE
       AND s.scheduled_by IN (SELECT employee_id FROM employee WHERE business_id = $1)
       ORDER BY s.start_date, s.start_time`,
      [bid]
    );

    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Employee open shifts error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Claim Open Shift ────────────────────────────────────────────────────────
router.post('/shifts/:id/claim', async (req: AuthRequest, res: Response) => {
  try {
    const shiftId = parseInt(String(req.params.id), 10);
    if (isNaN(shiftId)) {
      res.status(400).json({ error: 'Invalid shift ID.' });
      return;
    }

    const empId = req.user!.employee_id;

    const check = await pool.query(
      `SELECT shift_id, start_date, start_time, end_time
       FROM shifts WHERE shift_id = $1 AND employee_id IS NULL AND status = 'open'`,
      [shiftId]
    );

    if (check.rows.length === 0) {
      res.status(409).json({ error: 'This shift has already been claimed.' });
      return;
    }

    const shift = check.rows[0];

    const overlap = await pool.query(
      `SELECT shift_id FROM shifts
       WHERE employee_id = $1
       AND start_date = $2
       AND shift_id != $3
       AND status NOT IN ('denied', 'cancelled')
       AND (
         (start_time < $4 AND end_time > $5)
       )`,
      [empId, shift.start_date, shiftId, shift.end_time, shift.start_time]
    );

    if (overlap.rows.length > 0) {
      res.status(409).json({ error: 'You already have a shift that overlaps with this time.' });
      return;
    }

    await pool.query(
      `UPDATE shifts SET employee_id = $1, status = 'pending' WHERE shift_id = $2 AND employee_id IS NULL`,
      [empId, shiftId]
    );

    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Claim shift error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Create Swap Request ─────────────────────────────────────────────────────
router.post('/swaps', async (req: AuthRequest, res: Response) => {
  try {
    const { shift_id, requested_with_employee_id, reason } = req.body;
    const empId = await getEmployeeId(req, pool);
    if (!empId) { res.status(400).json({ error: 'No employee found' }); return; }

    const requester = await pool.query(
      'SELECT employee_name FROM employee WHERE employee_id = $1',
      [empId]
    );
    const target = await pool.query(
      'SELECT employee_name FROM employee WHERE employee_id = $1',
      [requested_with_employee_id]
    );

    await pool.query(
      `INSERT INTO shift_swaps (requester_employee_name, requester_employee_id,
       requestor_shift_id, target_employee_name, target_employee_id, shift_swap_status, comments)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
      [
        requester.rows[0]?.employee_name || '',
        empId,
        shift_id,
        target.rows[0]?.employee_name || '',
        requested_with_employee_id,
        reason || null,
      ]
    );

    res.status(201).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Create swap error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Swap History ────────────────────────────────────────────────────────────
router.get('/swaps/history', async (req: AuthRequest, res: Response) => {
  try {
    const empId = await getEmployeeId(req, pool);
    if (!empId) { res.json([]); return; }

    const result = await pool.query(
      `SELECT shift_swap_id AS swap_id,
              CONCAT('Shift #', requestor_shift_id, ' → ', target_employee_name) AS shift_detail,
              shift_swap_status AS status,
              comments AS reason
       FROM shift_swaps
       WHERE requester_employee_id = $1
       ORDER BY shift_swap_id DESC`,
      [empId]
    );
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Swap history error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── PTO Stats ───────────────────────────────────────────────────────────────
router.get('/pto/stats', async (req: AuthRequest, res: Response) => {
  try {
    const empId = await getEmployeeId(req, pool);
    if (!empId) { res.json({ total_requests: 0, approved: 0, pending: 0 }); return; }

    const result = await pool.query(
      `SELECT
         COUNT(*) AS total_requests,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM pto_requests WHERE employee_id = $1`,
      [empId]
    );

    const row = result.rows[0];
    res.json({
      total_requests: parseInt(row.total_requests),
      approved: parseInt(row.approved) || 0,
      pending: parseInt(row.pending) || 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('PTO stats error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Create PTO Request ──────────────────────────────────────────────────────
router.post('/pto', async (req: AuthRequest, res: Response) => {
  try {
    const { start_date, end_date, type, notes } = req.body;
    const empId = await getEmployeeId(req, pool);
    if (!empId) { res.status(400).json({ error: 'No employee found' }); return; }

    await pool.query(
      `INSERT INTO pto_requests (employee_id, start_date, end_date, request_type, status, comments)
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [empId, start_date, end_date || start_date, type || 'Vacation', notes || null]
    );

    res.status(201).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Create PTO error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── PTO History ─────────────────────────────────────────────────────────────
router.get('/pto/history', async (req: AuthRequest, res: Response) => {
  try {
    const empId = await getEmployeeId(req, pool);
    if (!empId) { res.json([]); return; }

    const result = await pool.query(
      `SELECT pto_request_id AS pto_id,
              TO_CHAR(start_date, 'Mon DD, YYYY') AS start_date,
              TO_CHAR(end_date, 'Mon DD, YYYY') AS end_date,
              request_type AS type,
              status,
              comments AS notes
       FROM pto_requests
       WHERE employee_id = $1
       ORDER BY pto_request_id DESC`,
      [empId]
    );
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('PTO history error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
