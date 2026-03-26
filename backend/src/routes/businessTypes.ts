import { Router, Request, Response } from 'express';
import pool from '../dbConfig';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT business_type_id, business_type FROM business_type ORDER BY business_type'
    );
    res.json(result.rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Database error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
