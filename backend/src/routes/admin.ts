import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../dbConfig';
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
  adminAddUserSchema,
  adminEditUserSchema,
  addShiftSchema,
  supportTicketCreateSchema,
  validateBody,
} from '../middleware/validation';
const router = Router();
const SHIFT_DURATION_HOURS_SQL = shiftDurationHoursSql('s');

router.use(authenticateToken, requireRole('admin'));

// ─── Business Dashboard Stats ────────────────────────────────────────────────
router.get('/overview/stats', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;
    const weeklyFilters: LaborQueryFilters = { range: 'weekly' };

    const emps = await pool.query(
      'SELECT COUNT(*) AS cnt FROM employee WHERE business_id = $1',
      [bid]
    );

    const mgrs = await pool.query(
      `SELECT COUNT(*) AS cnt FROM employee WHERE business_id = $1 AND LOWER(role) LIKE '%manager%'`,
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

    const weeklyDateFilter = buildShiftDateFilter('s.start_date', weeklyFilters);
    const laborSql = `${buildEmployeeLaborCte(
      SHIFT_DURATION_HOURS_SQL,
      weeklyDateFilter,
      '',
      buildSalaryCostSql(weeklyFilters)
    )}
    SELECT COALESCE(SUM(total_pay_cost), 0) AS weekly_cost,
           COALESCE(SUM(total_hours), 0) AS weekly_hours,
           COALESCE(SUM(CASE WHEN total_hours > 40 THEN 1 ELSE 0 END), 0) AS overtime_employees
    FROM employee_labor`;

    const { text, values } = toPositional(laborSql, { bid });
    const laborSummary = await pool.query(text, values);

    const lc = laborSummary.rows[0];

    res.json({
      total_employees: parseInt(emps.rows[0].cnt),
      total_managers: parseInt(mgrs.rows[0].cnt),
      shifts_this_week: parseInt(shiftsWeek.rows[0].cnt),
      weekly_labor_cost: parseFloat(lc.weekly_cost).toFixed(2),
      weekly_hours: parseFloat(lc.weekly_hours).toFixed(1),
      overtime_employees: parseInt(lc.overtime_employees),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Admin overview error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Labor: Hours by Employee (with overtime flag) ───────────────────────────
router.get('/labor/hours-by-employee', async (req: AuthRequest, res: Response) => {
  try {
    const filters: LaborQueryFilters = req.query;
    const dateFilter = buildShiftDateFilter('s.start_date', filters);
    const employeeFilter = buildEmployeeFilter('e', filters);
    const params: Record<string, any> = { bid: req.user!.business_id };
    applyDateFilterInputs(params, filters);
    applyEmployeeFilterInputs(params, filters);

    const { text, values } = toPositional(
      `${buildEmployeeLaborCte(SHIFT_DURATION_HOURS_SQL, dateFilter, employeeFilter, buildSalaryCostSql(filters))}
      SELECT employee_id, name, position, role, hourly_rate, yearly_salary,
             total_hours AS hours_this_week, total_pay_cost AS cost_this_week
      FROM employee_labor
      ORDER BY total_hours DESC, name`,
      params
    );
    const result = await pool.query(text, values);
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Labor hours error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Labor: Cost Breakdown by Position ───────────────────────────────────────
router.get('/labor/cost-by-position', async (req: AuthRequest, res: Response) => {
  try {
    const filters: LaborQueryFilters = req.query;
    const dateFilter = buildShiftDateFilter('s.start_date', filters);
    const employeeFilter = buildEmployeeFilter('e', filters);
    const params: Record<string, any> = { bid: req.user!.business_id };
    applyDateFilterInputs(params, filters);
    applyEmployeeFilterInputs(params, filters);

    const { text, values } = toPositional(
      `${buildEmployeeLaborCte(SHIFT_DURATION_HOURS_SQL, dateFilter, employeeFilter, buildSalaryCostSql(filters))}
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

// ─── Labor: Cost Breakdown by Role ───────────────────────────────────────────
router.get('/labor/cost-by-role', async (req: AuthRequest, res: Response) => {
  try {
    const filters: LaborQueryFilters = req.query;
    const dateFilter = buildShiftDateFilter('s.start_date', filters);
    const employeeFilter = buildEmployeeFilter('e', filters);
    const params: Record<string, any> = { bid: req.user!.business_id };
    applyDateFilterInputs(params, filters);
    applyEmployeeFilterInputs(params, filters);

    const { text, values } = toPositional(
      `${buildEmployeeLaborCte(SHIFT_DURATION_HOURS_SQL, dateFilter, employeeFilter, buildSalaryCostSql(filters))}
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

// ─── Schedule: Weekly ────────────────────────────────────────────────────────
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
    console.error('Admin weekly schedule error:', message);
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
    console.error('Admin monthly schedule error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Filter Options (for schedule dropdowns) ─────────────────────────────────
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
    console.error('Filters error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Activity Log (no table exists — return empty) ───────────────────────────
router.get('/overview/activity', async (_req: AuthRequest, res: Response) => {
  res.json([]);
});

// ─── Support Requests ────────────────────────────────────────────────────────
router.get('/support-requests', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
         t.ticket_id AS id,
         t.ticket_id,
         t.subject,
         t.description,
         t.priority,
         t.status,
         t.created_at,
         t.updated_at,
         t.resolved_at,
         t.category,
         t.resolution_notes,
         t.submitted_by_employee_id,
         CASE
           WHEN t.submitted_by_employee_id IS NULL THEN CONCAT(b.business_name, ' admin (', b.business_account_username, ')')
           ELSE submitter.employee_name
         END AS submitted_by_label
       FROM support_tickets t
       INNER JOIN businesses b ON b.business_id = t.business_id
       LEFT JOIN employee submitter ON submitter.employee_id = t.submitted_by_employee_id
       WHERE t.business_id = $1
       ORDER BY
         CASE t.status
           WHEN 'open' THEN 1
           WHEN 'in_progress' THEN 2
           ELSE 3
         END,
         t.created_at DESC`,
      [req.user!.business_id]
    );

    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Admin support requests error:', message);
    res.status(500).json({ error: message });
  }
});

router.post('/support-requests', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = validateBody(supportTicketCreateSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { subject, message, priority } = parsed.data;

    // Compute next ticket_id (no sequence in schema)
    const ticketIdResult = await pool.query('SELECT COALESCE(MAX(ticket_id), 0) + 1 AS next_id FROM support_tickets');
    const nextTicketId = ticketIdResult.rows[0].next_id;

    const result = await pool.query(
      `INSERT INTO support_tickets (
         ticket_id, business_id, subject, description, priority, status, category, submitted_by_employee_id
       )
       VALUES ($1, $2, $3, $4, $5, 'open', 'general', NULL)
       RETURNING ticket_id AS id, ticket_id, subject, description, priority, status,
                 created_at, updated_at, resolved_at, category, resolution_notes, submitted_by_employee_id`,
      [nextTicketId, req.user!.business_id, subject, message, priority]
    );

    res.status(201).json({
      ...result.rows[0],
      submitted_by_label: `${req.user!.business_name} admin (${req.user!.username})`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Create support request error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Employees List ──────────────────────────────────────────────────────────
router.get('/employees', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT employee_id, employee_name AS name, email, phone,
              role, employee_position AS position, position_type,
              employee_username AS username, hourly_rate,
              COALESCE(pto_balance_hours, 0) AS pto_balance_hours,
              COALESCE(pto_accrual_rate, 0) AS pto_accrual_rate
       FROM employee
       WHERE business_id = $1 AND LOWER(COALESCE(role, '')) NOT IN ('manager')
       ORDER BY employee_name`,
      [req.user!.business_id]
    );
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Admin employees error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Managers List ───────────────────────────────────────────────────────────
router.get('/managers', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT employee_id AS manager_id, employee_name AS name, email, phone,
              role, employee_position AS position, position_type,
              employee_username AS username, yearly_salary
       FROM employee
       WHERE business_id = $1 AND LOWER(COALESCE(role, '')) = 'manager'
       ORDER BY employee_name`,
      [req.user!.business_id]
    );
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Admin managers error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Roles List ──────────────────────────────────────────────────────────────
router.get('/roles', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT role AS role_name FROM employee WHERE business_id = $1 AND role IS NOT NULL ORDER BY role`,
      [req.user!.business_id]
    );
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Admin roles error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Add Employee ────────────────────────────────────────────────────────────
router.post('/employees', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = validateBody(adminAddUserSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { name, email, phone, role, position, username, password, hourly_rate } = parsed.data;

    const bid = req.user!.business_id;

    const existing = await pool.query(
      'SELECT employee_id FROM employee WHERE employee_username = $1',
      [username]
    );

    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Username already taken.' });
      return;
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await pool.query(
      `INSERT INTO employee (business_id, employee_name, email, phone, role, employee_position, hourly_rate, business_name, employee_username, employee_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [bid, name, email, phone || null, role, position, hourly_rate || null, req.user!.business_name, username, hashedPassword]
    );

    res.status(201).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Add employee error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Add Manager ─────────────────────────────────────────────────────────────
router.post('/managers', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = validateBody(adminAddUserSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { name, email, phone, role, position, username, password, yearly_salary } = parsed.data;

    const bid = req.user!.business_id;

    const existing = await pool.query(
      'SELECT employee_id FROM employee WHERE employee_username = $1',
      [username]
    );

    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Username already taken.' });
      return;
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await pool.query(
      `INSERT INTO employee (business_id, employee_name, email, phone, role, employee_position, yearly_salary, business_name, employee_username, employee_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [bid, name, email, phone || null, role, position, yearly_salary || null, req.user!.business_name, username, hashedPassword]
    );

    res.status(201).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Add manager error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Edit Employee ───────────────────────────────────────────────────────────
router.patch('/employees/:id', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = validateBody(adminEditUserSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { name, email, phone, role, position, username, password, hourly_rate, yearly_salary } = parsed.data;
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
                     role = @role, employee_position = @position,
                     hourly_rate = @hourly_rate, yearly_salary = @yearly_salary`;
    if (username) query += ', employee_username = @username';
    if (password) query += ', employee_password = @password';
    query += ' WHERE employee_id = @id AND business_id = @bid';

    const params: Record<string, any> = {
      id: empId, bid, name, email, phone: phone || null, role, position,
      hourly_rate: hourly_rate || null, yearly_salary: yearly_salary || null,
    };
    if (username) params.username = username;
    if (password) params.password = await bcrypt.hash(password, 10);

    const { text, values } = toPositional(query, params);
    await pool.query(text, values);
    res.status(200).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Edit employee error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Edit Manager ────────────────────────────────────────────────────────────
router.patch('/managers/:id', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = validateBody(adminEditUserSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { name, email, phone, role, position, username, password, hourly_rate, yearly_salary } = parsed.data;
    const bid = req.user!.business_id;
    const empId = parseInt(String(req.params.id), 10);
    if (isNaN(empId)) {
      res.status(400).json({ error: 'Invalid manager ID.' });
      return;
    }

    const check = await pool.query(
      'SELECT employee_id FROM employee WHERE employee_id = $1 AND business_id = $2',
      [empId, bid]
    );

    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Manager not found.' });
      return;
    }

    let query = `UPDATE employee
                 SET employee_name = @name, email = @email, phone = @phone,
                     role = @role, employee_position = @position,
                     hourly_rate = @hourly_rate, yearly_salary = @yearly_salary`;
    if (username) query += ', employee_username = @username';
    if (password) query += ', employee_password = @password';
    query += ' WHERE employee_id = @id AND business_id = @bid';

    const params: Record<string, any> = {
      id: empId, bid, name, email, phone: phone || null, role, position,
      hourly_rate: hourly_rate || null, yearly_salary: yearly_salary || null,
    };
    if (username) params.username = username;
    if (password) params.password = await bcrypt.hash(password, 10);

    const { text, values } = toPositional(query, params);
    await pool.query(text, values);
    res.status(200).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Edit manager error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Delete Employee ─────────────────────────────────────────────────────────
router.delete('/employees/:id', async (req: AuthRequest, res: Response) => {
  try {
    await pool.query(
      'DELETE FROM employee WHERE employee_id = $1 AND business_id = $2',
      [req.params.id, req.user!.business_id]
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Delete employee error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Delete Manager ──────────────────────────────────────────────────────────
router.delete('/managers/:id', async (req: AuthRequest, res: Response) => {
  try {
    await pool.query(
      'DELETE FROM employee WHERE employee_id = $1 AND business_id = $2',
      [req.params.id, req.user!.business_id]
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Delete manager error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Business Settings ───────────────────────────────────────────────────────
router.get('/settings/business', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT b.business_id, b.business_name, b.address,
              b.business_account_username AS admin_email,
              bt.business_type
       FROM businesses b
       LEFT JOIN business_type bt ON b.business_type_id = bt.business_type_id
       WHERE b.business_id = $1`,
      [req.user!.business_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Admin settings error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Add Shift (Admin) ──────────────────────────────────────────────────────
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
    console.error('Admin add shift error:', message);
    res.status(500).json({ error: message });
  }
});

// ─── Update Employee PTO Settings ────────────────────────────────────────────
router.patch('/employees/:id/pto', async (req: AuthRequest, res: Response) => {
  try {
    const bid = req.user!.business_id;
    const empId = parseInt(String(req.params.id), 10);
    if (isNaN(empId)) {
      res.status(400).json({ error: 'Invalid employee ID.' });
      return;
    }

    const { pto_balance_hours, pto_accrual_rate } = req.body;

    const check = await pool.query(
      'SELECT employee_id FROM employee WHERE employee_id = $1 AND business_id = $2',
      [empId, bid]
    );

    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Employee not found.' });
      return;
    }

    await pool.query(
      `UPDATE employee
       SET pto_balance_hours = $1, pto_accrual_rate = $2
       WHERE employee_id = $3`,
      [pto_balance_hours ?? null, pto_accrual_rate ?? null, empId]
    );

    res.status(200).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Update PTO settings error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
