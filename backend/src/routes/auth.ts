import { Router, Response } from 'express';
import pool from '../dbConfig';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  let name = req.user.business_name; // default for admin

  // For employees/managers, fetch their actual name
  if (req.user.employee_id) {
    try {
      const result = await pool.query(
        'SELECT employee_name FROM employee WHERE employee_id = $1',
        [req.user.employee_id]
      );
      if (result.rows.length > 0) {
        name = result.rows[0].employee_name;
      }
    } catch {
      // Fall back to business_name if lookup fails
    }
  }

  res.json({
    business_id: req.user.business_id,
    username: req.user.username,
    name,
    business_name: req.user.business_name,
    role: req.user.role,
    employee_id: req.user.employee_id || null,
  });
});

export default router;
