import { Router, Request, Response } from 'express';
import pool from '../dbConfig';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM pto_requests');
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
      'SELECT * FROM pto_requests WHERE employee_id = $1',
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
    const { pto_request_id, employee_id, start_date, start_time, end_date, end_time, request_type, status, comments } = req.body;
    await pool.query(
      `INSERT INTO pto_requests (pto_request_id, employee_id, start_date, start_time, end_date, end_time, request_type, status, comments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [pto_request_id, employee_id, start_date, start_time, end_date, end_time, request_type, status, comments]
    );
    res.status(201).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Database error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
