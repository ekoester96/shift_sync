import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const OPS_JWT_SECRET: string = process.env.OPS_JWT_SECRET || "ops-secret-change-me";

export interface OpsTokenPayload {
  type: "ops";
  ops_user_id: number;
  username: string;
  name: string;
}

export interface OpsRequest extends Request {
  opsUser?: OpsTokenPayload;
}

export function opsAuth(req: OpsRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "No ops token provided" });
    return;
  }

  try {
    const decoded = jwt.verify(header.split(" ")[1], OPS_JWT_SECRET) as OpsTokenPayload;
    if (decoded.type !== "ops") {
      res.status(403).json({ error: "Not an ops token" });
      return;
    }
    req.opsUser = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}