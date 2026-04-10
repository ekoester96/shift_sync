import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import '../config/env';

const JWT_SECRET = process.env.JWT_SECRET || 'shiftsync-dev-secret-change-in-production';

export interface AuthRequest extends Request {
  user?: {
    business_id: number;
    username: string;
    business_name: string;
    role: 'admin' | 'manager' | 'employee';
    employee_id?: number;  // present for manager/employee, absent for admin
  };
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      business_id: decoded.business_id,
      username: decoded.username,
      business_name: decoded.business_name,
      role: decoded.role,
      employee_id: decoded.employee_id,
    };
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Role guard — pass allowed roles, returns middleware
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
      return;
    }
    next();
  };
}
