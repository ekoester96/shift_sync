import { Router, Request, Response } from 'express';
import pool from '../dbConfig';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM shifts');
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Database error:', message);
    res.status(500).json({ error: message });
  }
});

router.get('/employee/:employeeId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM shifts WHERE employee_id = $1',
      [req.params.employeeId]
    );
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Database error:', message);
    res.status(500).json({ error: message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { shift_id, employee_id, start_date, start_time, end_date, end_time, position, status } = req.body;
    await pool.query(
      `INSERT INTO shifts (shift_id, employee_id, start_date, start_time, end_date, end_time, position, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [shift_id, employee_id, start_date, start_time, end_date, end_time, position, status]
    );
    res.status(201).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Database error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
