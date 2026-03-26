import { Router, Response } from 'express';
import pool from '../dbConfig';
import bcrypt from 'bcrypt';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import {
  applyDateFilterInputs,
  applyEmployeeFilterInputs,
  buildSalaryCostSql,
  buildEmployeeFilter,
  buildEmployeeLaborCte,
  buildShiftDateFilter,
  toPositional,
  type LaborQueryFilters,
} from '../utils/laborAnalytics';
import { shiftDurationHoursSql } from '../utils/shiftDurationSql';
import {
  managerAddEmployeeSchema,
  managerEditEmployeeSchema,
  statusUpdateSchema,
  addShiftSchema,
  addOpenShiftSchema,
  validateBody,
} from '../middleware/validation';
const router = Router();
const SHIFT_DURATION_HOURS_SQL = shiftDurationHoursSql('s');

// All manager routes require authentication
router.use(authenticateToken, requireRole('admin', 'manager'));

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
router.get('/dashboard/stats', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;
    const weeklyFilters: LaborQueryFilters = { range: 'weekly' };

    const empCount = await pool.query(
      'SELECT COUNT(*) AS cnt FROM employee WHERE business_id = $1',
      [bid]
    );

    const shiftsWeek = await pool.query(
      `SELECT COUNT(*) AS cnt FROM shifts s
       JOIN employee e ON s.employee_id = e.employee_id
       WHERE e.business_id = $1
       AND s.start_date >= CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int
       AND s.start_date < CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int + 7`,
      [bid]
    );

    const pendingSwaps = await pool.query(
      `SELECT COUNT(*) AS cnt FROM shift_swaps ss
       JOIN employee e ON ss.requester_employee_id = e.employee_id
       WHERE e.business_id = $1 AND ss.shift_swap_status = 'pending'`,
      [bid]
    );

    const pendingPto = await pool.query(
      `SELECT COUNT(*) AS cnt FROM pto_requests pr
       JOIN employee e ON pr.employee_id = e.employee_id
       WHERE e.business_id = $1 AND pr.status = 'pending'`,
      [bid]
    );

    const weeklyDateFilter = buildShiftDateFilter('s.start_date', weeklyFilters);
    const laborSql = `${buildEmployeeLaborCte(
      SHIFT_DURATION_HOURS_SQL,
      weeklyDateFilter,
      '',
      buildSalaryCostSql(weeklyFilters)
    )}
    SELECT COALESCE(SUM(total_pay_cost), 0) AS weekly_pay_cost
    FROM employee_labor`;

    const { text, values } = toPositional(laborSql, { bid });
    const laborSummary = await pool.query(text, values);

    const totalPending = parseInt(pendingSwaps.rows[0].cnt) + parseInt(pendingPto.rows[0].cnt);

    res.json({
      active_employees: parseInt(empCount.rows[0].cnt),
      shifts_this_week: parseInt(shiftsWeek.rows[0].cnt),
      pending_approvals: totalPending,
      pending_breakdown: `${pendingSwaps.rows[0].cnt} swaps, ${pendingPto.rows[0].cnt} PTO`,
      weekly_pay_cost: parseFloat(laborSummary.rows[0].weekly_pay_cost).toFixed(2),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Manager stats error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Post Open Shift ─────────────────────────────────────────────────────────
router.post('/shifts/open', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = validateBody(addOpenShiftSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { shift_date, start_time, end_time, position } = parsed.data;

    const startFull = start_time.length === 5 ? `${start_time}:00` : start_time;
    const endFull = end_time.length === 5 ? `${end_time}:00` : end_time;

    await pool.query(
      `INSERT INTO shifts (employee_id, start_date, end_date, start_time, end_time, position, status, scheduled_by)
       VALUES (NULL, $1, $1, $2::TIME, $3::TIME, $4, 'open', $5)`,
      [shift_date, startFull, endFull, position, req.user!.employee_id || null]
    );

    res.status(201).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Post open shift error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Get Open Shifts ─────────────────────────────────────────────────────────
router.get('/shifts/open', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;

    const result = await pool.query(
      `SELECT s.shift_id,
              TO_CHAR(s.start_date, 'YYYY-MM-DD') AS shift_date,
              TO_CHAR(s.start_time, 'HH24:MI') AS start_time,
              TO_CHAR(s.end_time, 'HH24:MI') AS end_time,
              s.position, s.status,
              s.employee_id,
              e.employee_name AS claimed_by
       FROM shifts s
       LEFT JOIN employee e ON s.employee_id = e.employee_id
       WHERE (s.status = 'open' OR (s.status = 'pending' AND s.scheduled_by IS NOT NULL))
       AND s.start_date >= CURRENT_DATE
       AND (
         s.scheduled_by IN (SELECT employee_id FROM employee WHERE business_id = $1)
         OR s.employee_id IS NULL
       )
       ORDER BY s.start_date, s.start_time`,
      [bid]
    );

    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Get open shifts error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Delete/Cancel Open Shift ────────────────────────────────────────────────
router.delete('/shifts/open/:id', async (req: AuthRequest, res: Response) => {
  try {
    const shiftId = parseInt(String(req.params.id), 10);
    if (isNaN(shiftId)) {
      res.status(400).json({ error: 'Invalid shift ID.' });
      return;
    }

    const shift = await pool.query(
      `SELECT shift_id, employee_id, status FROM shifts
       WHERE shift_id = $1 AND (
         (employee_id IS NULL AND status = 'open')
         OR (employee_id IS NOT NULL AND status = 'pending')
       )`,
      [shiftId]
    );

    if (shift.rows.length === 0) {
      res.status(404).json({ error: 'Shift not found or already confirmed.' });
      return;
    }

    const row = shift.rows[0];

    if (row.employee_id === null) {
      await pool.query('DELETE FROM shifts WHERE shift_id = $1', [shiftId]);
    } else {
      await pool.query(
        `UPDATE shifts SET status = 'cancelled', employee_id = NULL WHERE shift_id = $1`,
        [shiftId]
      );
    }

    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Delete open shift error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Today's Shifts ──────────────────────────────────────────────────────────
router.get('/shifts/today', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT s.shift_id, e.employee_name, s.position, s.status,
              TO_CHAR(s.start_time, 'HH24:MI') AS start_time,
              TO_CHAR(s.end_time, 'HH24:MI') AS end_time
       FROM shifts s
       JOIN employee e ON s.employee_id = e.employee_id
       WHERE e.business_id = $1 AND s.start_date = CURRENT_DATE
       ORDER BY s.start_time`,
      [req.user!.business_id]
    );
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Today shifts error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Pending Approvals (combined swaps + PTO for dashboard widget) ───────────
router.get('/approvals/pending', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;

    const swaps = await pool.query(
      `SELECT ss.shift_swap_id AS id, 'Swap' AS type,
              ss.requester_employee_name AS employee_name,
              CONCAT('Shift #', ss.requestor_shift_id, ' → ', ss.target_employee_name) AS detail
       FROM shift_swaps ss
       JOIN employee e ON ss.requester_employee_id = e.employee_id
       WHERE e.business_id = $1 AND ss.shift_swap_status = 'pending'`,
      [bid]
    );

    const ptos = await pool.query(
      `SELECT pr.pto_request_id AS id, 'PTO' AS type,
              e.employee_name,
              CONCAT(pr.request_type, ': ', TO_CHAR(pr.start_date, 'Mon DD, YYYY'), ' – ', TO_CHAR(pr.end_date, 'Mon DD, YYYY')) AS detail
       FROM pto_requests pr
       JOIN employee e ON pr.employee_id = e.employee_id
       WHERE e.business_id = $1 AND pr.status = 'pending'`,
      [bid]
    );

    res.json([...swaps.rows, ...ptos.rows]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Pending approvals error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Weekly Schedule ─────────────────────────────────────────────────────────
router.get('/schedule', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;

    const emps = await pool.query(
      `SELECT employee_id, employee_name AS name, employee_position AS position
       FROM employee WHERE business_id = $1 ORDER BY employee_name`,
      [bid]
    );

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

    const weekStart = days[0].iso;
    const weekEnd = days[6].iso;

    const shifts = await pool.query(
      `SELECT s.shift_id, s.employee_id,
              TO_CHAR(s.start_date, 'YYYY-MM-DD') AS shift_date,
              TO_CHAR(s.start_time, 'HH24:MI') AS start_time,
              TO_CHAR(s.end_time, 'HH24:MI') AS end_time,
              s.position
       FROM shifts s
       JOIN employee e ON s.employee_id = e.employee_id
       WHERE e.business_id = $1
       AND s.start_date >= $2 AND s.start_date <= $3`,
      [bid, weekStart, weekEnd]
    );

    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const weekLabel = `${mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    res.json({
      week_label: weekLabel,
      days,
      employees: emps.rows,
      shifts: shifts.rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Schedule error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Employees List ──────────────────────────────────────────────────────────
router.get('/employees', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT employee_id, employee_name AS name, email,
              employee_position AS position, role, position_type, phone
       FROM employee WHERE business_id = $1 ORDER BY employee_name`,
      [req.user!.business_id]
    );
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Manager employees error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Shift Swaps ─────────────────────────────────────────────────────────────
router.get('/swaps', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;
    const { status } = req.query;

    let statusFilter = '';
    const params: Record<string, any> = { bid };
    if (status && status !== 'all') {
      statusFilter = ` AND ss.shift_swap_status = @filterStatus`;
      params.filterStatus = status as string;
    }

    const { text, values } = toPositional(
      `SELECT ss.shift_swap_id AS id,
              ss.requester_employee_name AS requesting_employee_name,
              CONCAT('Shift #', ss.requestor_shift_id, ' → ', ss.target_employee_name) AS shift_detail,
              ss.shift_swap_status AS status,
              ss.comments AS reason,
              ss.created_at
       FROM shift_swaps ss
       JOIN employee e ON ss.requester_employee_id = e.employee_id
       WHERE e.business_id = @bid ${statusFilter}
       ORDER BY ss.shift_swap_id DESC`,
      params
    );
    const result = await pool.query(text, values);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Manager swaps error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Update Swap Status ──────────────────────────────────────────────────────
router.patch('/swaps/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = validateBody(statusUpdateSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { status } = parsed.data;
    await pool.query(
      'UPDATE shift_swaps SET shift_swap_status = $1 WHERE shift_swap_id = $2',
      [status, req.params.id]
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Update swap error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── PTO Requests ────────────────────────────────────────────────────────────
router.get('/pto', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;
    const { status } = req.query;

    let statusFilter = '';
    const params: Record<string, any> = { bid };
    if (status && status !== 'all') {
      statusFilter = ` AND pr.status = @filterStatus`;
      params.filterStatus = status as string;
    }

    const { text, values } = toPositional(
      `SELECT pr.pto_request_id AS id,
              e.employee_name,
              CONCAT(pr.request_type, ': ', TO_CHAR(pr.start_date, 'Mon DD, YYYY'), ' – ', TO_CHAR(pr.end_date, 'Mon DD, YYYY')) AS pto_detail,
              pr.status,
              pr.comments AS reason,
              pr.request_type,
              pr.created_at
       FROM pto_requests pr
       JOIN employee e ON pr.employee_id = e.employee_id
       WHERE e.business_id = @bid ${statusFilter}
       ORDER BY pr.pto_request_id DESC`,
      params
    );
    const result = await pool.query(text, values);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Manager PTO error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Update PTO Status ───────────────────────────────────────────────────────
router.patch('/pto/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = validateBody(statusUpdateSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { status } = parsed.data;
    await pool.query(
      'UPDATE pto_requests SET status = $1 WHERE pto_request_id = $2',
      [status, req.params.id]
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Update PTO error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Reports Summary ─────────────────────────────────────────────────────────
router.get('/reports/summary', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;
    const filters: LaborQueryFilters = req.query;
    const dateFilter = buildShiftDateFilter('s.start_date', filters);
    const empFilter = buildEmployeeFilter('e', filters);
    const params: Record<string, any> = { bid };
    applyDateFilterInputs(params, filters);
    applyEmployeeFilterInputs(params, filters);

    const { text, values } = toPositional(
      `SELECT COUNT(DISTINCT s.shift_id) AS total_shifts,
              COUNT(DISTINCT s.employee_id) AS employee_count,
              COALESCE(SUM(${SHIFT_DURATION_HOURS_SQL}), 0) AS total_hours
       FROM shifts s
       JOIN employee e ON s.employee_id = e.employee_id
       WHERE e.business_id = @bid ${dateFilter} ${empFilter}
       AND s.employee_id IS NOT NULL`,
      params
    );
    const result = await pool.query(text, values);

    const row = result.rows[0];
    const avgHours = row.employee_count > 0 ? (row.total_hours / row.employee_count).toFixed(1) : '0';

    res.json({
      total_hours: parseFloat(row.total_hours).toFixed(1),
      employee_count: parseInt(row.employee_count),
      total_shifts: parseInt(row.total_shifts),
      avg_hours_per_employee: avgHours,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Reports summary error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Hours by Employee ───────────────────────────────────────────────────────
router.get('/reports/hours-by-employee', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;
    const filters: LaborQueryFilters = req.query;
    const dateFilter = buildShiftDateFilter('s.start_date', filters);
    const empFilter = buildEmployeeFilter('e', filters);
    const params: Record<string, any> = { bid };
    applyDateFilterInputs(params, filters);
    applyEmployeeFilterInputs(params, filters);

    const { text, values } = toPositional(
      `${buildEmployeeLaborCte(SHIFT_DURATION_HOURS_SQL, dateFilter, empFilter, buildSalaryCostSql(filters))}
      SELECT employee_id, name, position, role, hourly_rate, yearly_salary,
             total_hours AS hours_this_week, total_pay_cost AS labor_cost
      FROM employee_labor
      ORDER BY total_hours DESC, name`,
      params
    );
    const result = await pool.query(text, values);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Hours by employee error:', message);
    res.status(500).json({ error: message });
  }
});

router.get('/reports/cost-by-position', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;
    const filters: LaborQueryFilters = req.query;
    const dateFilter = buildShiftDateFilter('s.start_date', filters);
    const empFilter = buildEmployeeFilter('e', filters);
    const params: Record<string, any> = { bid };
    applyDateFilterInputs(params, filters);
    applyEmployeeFilterInputs(params, filters);

    const { text, values } = toPositional(
      `${buildEmployeeLaborCte(SHIFT_DURATION_HOURS_SQL, dateFilter, empFilter, buildSalaryCostSql(filters))}
      SELECT position,
             COUNT(*) AS employee_count,
             COALESCE(SUM(total_hours), 0) AS total_hours,
             COALESCE(SUM(total_pay_cost), 0) AS total_cost
      FROM employee_labor
      GROUP BY position
      ORDER BY total_cost DESC, position`,
      params
    );
    const result = await pool.query(text, values);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Cost by position error:', message);
    res.status(500).json({ error: message });
  }
});

router.get('/reports/cost-by-role', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;
    const filters: LaborQueryFilters = req.query;
    const dateFilter = buildShiftDateFilter('s.start_date', filters);
    const empFilter = buildEmployeeFilter('e', filters);
    const params: Record<string, any> = { bid };
    applyDateFilterInputs(params, filters);
    applyEmployeeFilterInputs(params, filters);

    const { text, values } = toPositional(
      `${buildEmployeeLaborCte(SHIFT_DURATION_HOURS_SQL, dateFilter, empFilter, buildSalaryCostSql(filters))}
      SELECT role,
             COUNT(*) AS employee_count,
             COALESCE(SUM(total_hours), 0) AS total_hours,
             COALESCE(SUM(total_pay_cost), 0) AS total_cost
      FROM employee_labor
      GROUP BY role
      ORDER BY total_cost DESC, role`,
      params
    );
    const result = await pool.query(text, values);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Cost by role error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Create Employee (Manager) ───────────────────────────────────────────────
router.post('/employees', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = validateBody(managerAddEmployeeSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { name, email, phone, role, position, username, password } = parsed.data;
    const bid = req.user!.business_id;

    const existing = await pool.query(
      'SELECT employee_id FROM employee WHERE email = $1 AND business_id = $2',
      [email, bid]
    );

    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'An employee with this email already exists.' });
      return;
    }

    const existingUser = await pool.query(
      'SELECT employee_id FROM employee WHERE employee_username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      res.status(409).json({ error: 'Username already taken.' });
      return;
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await pool.query(
      `INSERT INTO employee (business_id, employee_name, email, phone, role, employee_position, business_name, employee_username, employee_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [bid, name, email, phone, role, position, req.user!.business_name, username, hashedPassword]
    );

    res.status(201).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Manager create employee error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Edit Employee (Manager) ─────────────────────────────────────────────────
router.patch('/employees/:id', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = validateBody(managerEditEmployeeSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { name, email, phone, role, position, username, password } = parsed.data;
    const bid = req.user!.business_id;
    const empId = parseInt(String(req.params.id), 10);
    if (isNaN(empId)) {
      res.status(400).json({ error: 'Invalid employee ID.' });
      return;
    }

    const check = await pool.query(
      'SELECT employee_id FROM employee WHERE employee_id = $1 AND business_id = $2',
      [empId, bid]
    );

    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Employee not found.' });
      return;
    }

    let query = `UPDATE employee
                 SET employee_name = @name, email = @email, phone = @phone,
                     role = @role, employee_position = @position`;
    if (username) query += ', employee_username = @username';
    if (password) query += ', employee_password = @password';
    query += ' WHERE employee_id = @id AND business_id = @bid';

    const params: Record<string, any> = { id: empId, bid, name, email, phone, role, position };
    if (username) params.username = username;
    if (password) params.password = await bcrypt.hash(password, 10);

    const { text, values } = toPositional(query, params);
    await pool.query(text, values);
    res.status(200).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Manager edit employee error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Add Shift ───────────────────────────────────────────────────────────────
router.post('/shifts', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = validateBody(addShiftSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { employee_id, shift_date, start_time, end_time, position } = parsed.data;
    const bid = req.user!.business_id;

    const startFull = start_time.length === 5 ? `${start_time}:00` : start_time;
    const endFull = end_time.length === 5 ? `${end_time}:00` : end_time;

    const check = await pool.query(
      'SELECT employee_id FROM employee WHERE employee_id = $1 AND business_id = $2',
      [employee_id, bid]
    );

    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Employee not found in this business.' });
      return;
    }

    await pool.query(
      `INSERT INTO shifts (employee_id, start_date, end_date, start_time, end_time, position, status, scheduled_by)
       VALUES ($1, $2, $2, $3::TIME, $4::TIME, $5, 'confirmed', $6)`,
      [employee_id, shift_date, startFull, endFull, position, req.user!.employee_id || null]
    );

    res.status(201).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Manager add shift error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Filter Options ──────────────────────────────────────────────────────────
router.get('/filters', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;

    const positions = await pool.query(
      `SELECT DISTINCT employee_position AS position FROM employee WHERE business_id = $1 AND employee_position IS NOT NULL AND employee_position != '' ORDER BY employee_position`,
      [bid]
    );

    const roles = await pool.query(
      `SELECT DISTINCT role FROM employee WHERE business_id = $1 AND role IS NOT NULL ORDER BY role`,
      [bid]
    );

    const employees = await pool.query(
      `SELECT employee_id, employee_name AS name, role, employee_position AS position FROM employee WHERE business_id = $1 ORDER BY employee_name`,
      [bid]
    );

    res.json({
      positions: positions.rows.map((r: any) => r.position),
      roles: roles.rows.map((r: any) => r.role),
      employees: employees.rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Manager filters error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Schedule: Weekly (with filters) ─────────────────────────────────────────
router.get('/schedule/weekly', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;
    const { role, position, employee_id } = req.query;

    let empFilter = 'WHERE e.business_id = @bid';
    if (role) empFilter += ` AND e.role = @role`;
    if (position) empFilter += ` AND e.employee_position = @position`;
    if (employee_id) empFilter += ` AND e.employee_id = @empId`;

    const empParams: Record<string, any> = { bid };
    if (role) empParams.role = role as string;
    if (position) empParams.position = position as string;
    if (employee_id) empParams.empId = parseInt(employee_id as string, 10);

    const { text: empText, values: empValues } = toPositional(
      `SELECT e.employee_id, e.employee_name AS name, e.employee_position AS position, e.role
       FROM employee e ${empFilter} ORDER BY e.employee_name`,
      empParams
    );
    const emps = await pool.query(empText, empValues);

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

    let shiftFilter = 'WHERE e2.business_id = @bid2 AND s.start_date >= @weekStart AND s.start_date <= @weekEnd';
    const shiftParams: Record<string, any> = { bid2: bid, weekStart: days[0].iso, weekEnd: days[6].iso };
    if (role) { shiftParams.role2 = role as string; shiftFilter += ` AND e2.role = @role2`; }
    if (position) { shiftParams.position2 = position as string; shiftFilter += ` AND e2.employee_position = @position2`; }
    if (employee_id) { shiftParams.empId2 = parseInt(employee_id as string, 10); shiftFilter += ` AND e2.employee_id = @empId2`; }

    const { text: shiftText, values: shiftValues } = toPositional(
      `SELECT s.shift_id, s.employee_id,
              TO_CHAR(s.start_date, 'YYYY-MM-DD') AS shift_date,
              TO_CHAR(s.start_time, 'HH24:MI') AS start_time,
              TO_CHAR(s.end_time, 'HH24:MI') AS end_time,
              s.position
       FROM shifts s
       JOIN employee e2 ON s.employee_id = e2.employee_id
       ${shiftFilter}`,
      shiftParams
    );
    const shifts = await pool.query(shiftText, shiftValues);

    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const weekLabel = `${mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    res.json({ week_label: weekLabel, days, employees: emps.rows, shifts: shifts.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Manager weekly schedule error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Schedule: Monthly ───────────────────────────────────────────────────────
router.get('/schedule/monthly', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;
    const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();
    const month = parseInt(req.query.month as string, 10) || (new Date().getMonth() + 1);
    const { role, position, employee_id } = req.query;

    let filter = `WHERE e.business_id = @bid
                  AND EXTRACT(YEAR FROM s.start_date) = @year AND EXTRACT(MONTH FROM s.start_date) = @month`;
    const params: Record<string, any> = { bid, year, month };
    if (role) { params.role = role as string; filter += ` AND e.role = @role`; }
    if (position) { params.position = position as string; filter += ` AND e.employee_position = @position`; }
    if (employee_id) { params.empId = parseInt(employee_id as string, 10); filter += ` AND e.employee_id = @empId`; }

    const { text: resultText, values: resultValues } = toPositional(
      `SELECT TO_CHAR(s.start_date, 'YYYY-MM-DD') AS shift_date,
              COUNT(*) AS shift_count,
              COALESCE(SUM(${SHIFT_DURATION_HOURS_SQL}), 0) AS total_hours
       FROM shifts s
       JOIN employee e ON s.employee_id = e.employee_id
       ${filter}
       GROUP BY s.start_date
       ORDER BY s.start_date`,
      params
    );
    const result = await pool.query(resultText, resultValues);

    const details = await pool.query(
      `SELECT s.shift_id, s.employee_id, e.employee_name,
              TO_CHAR(s.start_date, 'YYYY-MM-DD') AS shift_date,
              TO_CHAR(s.start_time, 'HH24:MI') AS start_time,
              TO_CHAR(s.end_time, 'HH24:MI') AS end_time,
              s.position, e.role
       FROM shifts s
       JOIN employee e ON s.employee_id = e.employee_id
       WHERE e.business_id = $1
       AND EXTRACT(YEAR FROM s.start_date) = $2 AND EXTRACT(MONTH FROM s.start_date) = $3
       ORDER BY s.start_date, s.start_time`,
      [bid, year, month]
    );

    const positions = await pool.query(
      `SELECT DISTINCT employee_position AS position FROM employee WHERE business_id = $1 AND employee_position IS NOT NULL ORDER BY employee_position`,
      [bid]
    );

    const roles = await pool.query(
      `SELECT DISTINCT role FROM employee WHERE business_id = $1 AND role IS NOT NULL ORDER BY role`,
      [bid]
    );

    const employees = await pool.query(
      `SELECT employee_id, employee_name AS name FROM employee WHERE business_id = $1 ORDER BY employee_name`,
      [bid]
    );

    res.json({
      year, month,
      days: result.rows,
      shifts: details.rows,
      filters: {
        positions: positions.rows.map((r: any) => r.position),
        roles: roles.rows.map((r: any) => r.role),
        employees: employees.rows,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Manager monthly schedule error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
