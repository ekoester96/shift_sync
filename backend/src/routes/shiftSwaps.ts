import { Router, Request, Response } from 'express';
import pool from '../dbConfig';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM shift_swaps');
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Database error:', message);
    res.status(500).json({ error: message });
  }
});

router.get('/requester/:employeeId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM shift_swaps WHERE requester_employee_id = $1',
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
    const {
      shift_swap_id, requester_employee_name, requester_employee_id,
      requestor_shift_id, target_employee_name, target_employee_id,
      target_shift_id, shift_swap_status, comments
    } = req.body;
    await pool.query(
      `INSERT INTO shift_swaps (shift_swap_id, requester_employee_name, requester_employee_id, requestor_shift_id, target_employee_name, target_employee_id, target_shift_id, shift_swap_status, comments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [shift_swap_id, requester_employee_name, requester_employee_id, requestor_shift_id, target_employee_name, target_employee_id, target_shift_id, shift_swap_status, comments]
    );
    res.status(201).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Database error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
