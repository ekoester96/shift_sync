import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../dbConfig';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'shiftsync-dev-secret-change-in-production';

router.post('/', async (req: Request, res: Response) => {
  const { business_name, username, password, address, business_type_id } = req.body;

  if (!business_name || !username || !password) {
    res.status(400).json({ error: 'Business name, username, and password are required.' });
    return;
  }

  try {
    const existingUser = await pool.query(
      'SELECT business_id FROM businesses WHERE business_account_username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      res.status(409).json({ error: 'Username already taken.' });
      return;
    }

    const maxIdResult = await pool.query('SELECT COALESCE(MAX(business_id), 0) + 1 AS next_id FROM businesses');
    const nextBusinessId: number = maxIdResult.rows[0].next_id;

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await pool.query(
      `INSERT INTO businesses (business_id, business_name, address, business_type_id, business_account_username, business_account_password)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [nextBusinessId, business_name, address || null, business_type_id || null, username, hashedPassword]
    );

    // Auto-login: sign a JWT immediately
    const token = jwt.sign(
      {
        business_id: nextBusinessId,
        username: username,
        business_name: business_name,
        role: 'admin',
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(201).json({
      success: true,
      token,
      business_id: nextBusinessId,
      business_name: business_name,
      role: 'admin',
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Signup error:', message);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

export default router;
