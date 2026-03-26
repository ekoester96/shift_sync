import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../dbConfig';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM employee');
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Database error:', message);
    res.status(500).json({ error: message });
  }
});

router.get('/business/:businessId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM employee WHERE business_id = $1',
      [req.params.businessId]
    );
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Database error:', message);
    res.status(500).json({ error: message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM employee WHERE employee_id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Database error:', message);
    res.status(500).json({ error: message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      employee_id, business_id, employee_name, email, phone, role,
      hourly_rate, position_type, business_name, employee_username,
      employee_password, employee_position
    } = req.body;

    let hashedPassword: string | null = null;
    if (employee_password) {
      const saltRounds = 10;
      hashedPassword = await bcrypt.hash(employee_password, saltRounds);
    }

    await pool.query(
      `INSERT INTO employee (employee_id, business_id, employee_name, email, phone, role, hourly_rate, position_type, business_name, employee_username, employee_password, employee_position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [employee_id, business_id, employee_name, email, phone, role, hourly_rate, position_type, business_name, employee_username, hashedPassword, employee_position]
    );
    res.status(201).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Database error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
