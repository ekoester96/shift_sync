import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../dbConfig";
import { opsAuth, OPS_JWT_SECRET, OpsRequest } from "../middleware/opsAuth";

const router = Router();

// POST /api/ops/auth/login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;
    console.log("Ops login attempt:", username);

    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required." });
      return;
    }

    const result = await pool.query(
      "SELECT * FROM ops_users WHERE username = $1 AND is_active = true",
      [username]
    );

    const user = result.rows[0];
    console.log("User found:", !!user);

    if (!user) {
      res.status(401).json({ error: "Invalid username or password." });
      return;
    }

    console.log("Hash in DB:", user.password_hash);
    console.log("Hash length:", user.password_hash?.length);

    const match = await bcrypt.compare(password, user.password_hash);
    console.log("Password match:", match);

    if (!match) {
      res.status(401).json({ error: "Invalid username or password." });
      return;
    }

    await pool.query(
      "UPDATE ops_users SET last_login = NOW() WHERE ops_user_id = $1",
      [user.ops_user_id]
    );

    const token = jwt.sign(
      {
        type: "ops" as const,
        ops_user_id: user.ops_user_id,
        username: user.username,
        name: user.name,
      },
      OPS_JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: {
        ops_user_id: user.ops_user_id,
        username: user.username,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Ops login error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/ops/auth/me
router.get("/me", opsAuth, async (req: OpsRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      "SELECT ops_user_id, username, name, email, last_login FROM ops_users WHERE ops_user_id = $1 AND is_active = true",
      [req.opsUser!.ops_user_id]
    );

    const user = result.rows[0];
    if (!user) {
      res.status(401).json({ error: "User not found or inactive." });
      return;
    }

    res.json(user);
  } catch (err) {
    console.error("Ops /me error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
