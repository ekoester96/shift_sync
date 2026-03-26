import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../dbConfig';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'shiftsync-dev-secret-change-in-production';

router.post('/', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }

  try {
    // ── Try 0: Ops user ──────────────────────────────────────────
    const opsResult = await pool.query(
      `SELECT ops_user_id, username, password_hash, name, email
       FROM ops_users
       WHERE username = $1 AND is_active = true`,
      [username]
    );

    if (opsResult.rows.length > 0) {
      const ops = opsResult.rows[0];
      const opsMatch = await bcrypt.compare(password, ops.password_hash);

      if (!opsMatch) {
        res.status(401).json({ error: 'Invalid username or password.' });
        return;
      }

      await pool.query(
        'UPDATE ops_users SET last_login = NOW() WHERE ops_user_id = $1',
        [ops.ops_user_id]
      );

      const token = jwt.sign(
        {
          type: 'ops',
          ops_user_id: ops.ops_user_id,
          username: ops.username,
          name: ops.name,
          role: 'ops',
        },
        JWT_SECRET,
        { expiresIn: '8h' }
      );

      res.json({
        token,
        role: 'ops',
        name: ops.name,
      });
      return;
    }

    // ── Try 1: Business owner (admin) ────────────────────────────
    const bizResult = await pool.query(
      `SELECT business_id, business_name, business_account_username, business_account_password
       FROM businesses
       WHERE business_account_username = $1`,
      [username]
    );

    if (bizResult.rows.length > 0) {
      const biz = bizResult.rows[0];
      const passwordMatch = await bcrypt.compare(password, biz.business_account_password);

      if (!passwordMatch) {
        res.status(401).json({ error: 'Invalid username or password.' });
        return;
      }

      const token = jwt.sign(
        {
          business_id: biz.business_id,
          username: biz.business_account_username,
          business_name: biz.business_name,
          role: 'admin',
        },
        JWT_SECRET,
        { expiresIn: '8h' }
      );

      res.json({
        token,
        business_id: biz.business_id,
        business_name: biz.business_name,
        role: 'admin',
      });
      return;
    }

    // ── Try 2: Employee or Manager ───────────────────────────────
    const empResult = await pool.query(
      `SELECT e.employee_id, e.business_id, e.employee_name, e.role,
              e.employee_username, e.employee_password,
              b.business_name
       FROM employee e
       JOIN businesses b ON e.business_id = b.business_id
       WHERE e.employee_username = $1`,
      [username]
    );

    if (empResult.rows.length === 0) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    const emp = empResult.rows[0];

    if (!emp.employee_password) {
      res.status(401).json({ error: 'Account not set up. Contact your admin.' });
      return;
    }

    const empPasswordMatch = await bcrypt.compare(password, emp.employee_password);

    if (!empPasswordMatch) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    // Determine role — normalize to 'manager' or 'employee'
    const normalizedRole = emp.role?.toLowerCase().includes('manager') ? 'manager' : 'employee';

    const token = jwt.sign(
      {
        business_id: emp.business_id,
        username: emp.employee_username,
        business_name: emp.business_name,
        role: normalizedRole,
        employee_id: emp.employee_id,
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      business_id: emp.business_id,
      business_name: emp.business_name,
      role: normalizedRole,
      employee_id: emp.employee_id,
      name: emp.employee_name,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Login error:', message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

export default router;
