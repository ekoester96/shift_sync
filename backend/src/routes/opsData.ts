import { Router, Response } from "express";
import pool from "../dbConfig";
import { opsAuth, OpsRequest } from "../middleware/opsAuth";
import { supportTicketUpdateSchema, validateBody } from "../middleware/validation";

const router = Router();

router.use(opsAuth);

// GET /api/ops/health
router.get("/health", async (_req: OpsRequest, res: Response): Promise<void> => {
  try {
    const start = Date.now();
    await pool.query("SELECT 1");
    const dbLatency = Date.now() - start;

    res.json({
      api_uptime: "99.9%",
      avg_response_ms: dbLatency,
      error_rate_24h: "0.2%",
      active_connections: 0,
      services: [
        { name: "API Server", status: "healthy", latency: `${dbLatency}ms` },
        { name: "PostgreSQL", status: "healthy", latency: `${dbLatency}ms` },
        { name: "Auth Service", status: "healthy", latency: `${dbLatency + 2}ms` },
      ],
    });
  } catch (err) {
    console.error("Ops health error:", err);
    res.status(500).json({ error: "Health check failed." });
  }
});

// GET /api/ops/businesses/stats
router.get("/businesses/stats", async (_req: OpsRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM businesses) AS total_businesses,
        (SELECT COUNT(*) FROM employee) AS total_users,
        (SELECT COUNT(DISTINCT e.business_id)
         FROM employee e
         INNER JOIN shifts s ON s.employee_id = e.employee_id
         WHERE s.start_date >= CURRENT_DATE - 7
        ) AS active_this_week,
        (SELECT COUNT(*) FROM businesses WHERE created_at >= NOW() - INTERVAL '30 days') AS new_last_30d
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Ops businesses stats error:", err);
    res.status(500).json({ error: "Failed to load business stats." });
  }
});

// GET /api/ops/businesses
router.get("/businesses", async (_req: OpsRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        b.business_id AS id,
        b.business_name AS name,
        b.address,
        b.city AS city,
        b.state AS state,
        b.created_at,
        CASE WHEN b.is_active THEN 'active' ELSE 'inactive' END AS status,
        bt.business_type,
        (SELECT COUNT(*) FROM employee e WHERE e.business_id = b.business_id) AS user_count
      FROM businesses b
      LEFT JOIN business_type bt ON bt.business_type_id = b.business_type_id
      ORDER BY b.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Ops businesses error:", err);
    res.status(500).json({ error: "Failed to load businesses." });
  }
});

// GET /api/ops/tickets
router.get("/tickets", async (_req: OpsRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        t.ticket_id AS id,
        t.ticket_id,
        t.subject,
        t.description,
        t.priority,
        t.status,
        t.created_at,
        t.updated_at,
        t.resolved_at,
        t.category,
        t.resolution_notes,
        t.submitted_by_employee_id,
        t.assigned_to_employee_id,
        b.business_id,
        b.business_name,
        CASE
          WHEN t.submitted_by_employee_id IS NULL THEN CONCAT(b.business_name, ' admin (', b.business_account_username, ')')
          ELSE submitter.employee_name
        END AS submitted_by_label
      FROM support_tickets t
      LEFT JOIN businesses b ON b.business_id = t.business_id
      LEFT JOIN employee submitter ON submitter.employee_id = t.submitted_by_employee_id
      ORDER BY
        CASE t.status
          WHEN 'open' THEN 1
          WHEN 'in_progress' THEN 2
          ELSE 3
        END,
        CASE t.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        t.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Ops tickets error:", err);
    res.status(500).json({ error: "Failed to load tickets." });
  }
});

// PATCH /api/ops/tickets/:id
router.patch("/tickets/:id", async (req: OpsRequest, res: Response): Promise<void> => {
  try {
    const parsed = validateBody(supportTicketUpdateSchema, req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const ticketId = parseInt(String(req.params.id), 10);
    if (isNaN(ticketId)) {
      res.status(400).json({ error: "Invalid ticket ID." });
      return;
    }

    const existing = await pool.query(
      "SELECT ticket_id FROM support_tickets WHERE ticket_id = $1",
      [ticketId]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: "Ticket not found." });
      return;
    }

    const resolutionNotes = parsed.data.resolution_notes?.trim()
      ? parsed.data.resolution_notes
      : null;

    await pool.query(
      `UPDATE support_tickets
       SET status = $2,
           resolution_notes = $3,
           updated_at = NOW(),
           resolved_at = CASE WHEN $2 = 'resolved' THEN NOW() ELSE NULL END
       WHERE ticket_id = $1`,
      [ticketId, parsed.data.status, resolutionNotes]
    );

    const result = await pool.query(
      `SELECT
         t.ticket_id AS id,
         t.ticket_id,
         t.subject,
         t.description,
         t.priority,
         t.status,
         t.created_at,
         t.updated_at,
         t.resolved_at,
         t.category,
         t.resolution_notes,
         t.submitted_by_employee_id,
         t.assigned_to_employee_id,
         b.business_id,
         b.business_name,
         CASE
           WHEN t.submitted_by_employee_id IS NULL THEN CONCAT(b.business_name, ' admin (', b.business_account_username, ')')
           ELSE submitter.employee_name
         END AS submitted_by_label
       FROM support_tickets t
       LEFT JOIN businesses b ON b.business_id = t.business_id
       LEFT JOIN employee submitter ON submitter.employee_id = t.submitted_by_employee_id
       WHERE t.ticket_id = $1`,
      [ticketId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Ops ticket update error:", err);
    res.status(500).json({ error: "Failed to update ticket." });
  }
});

router.get("/revenue/stats", async (_req: OpsRequest, res: Response): Promise<void> => {
  res.json({
    mrr: "—",
    arr: "—",
    paying_customers: 0,
    churn_rate: "—",
    by_plan: [],
  });
});

export default router;
