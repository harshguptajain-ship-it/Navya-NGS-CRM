const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireLeadAccess } = require("../middleware/leadAccess");

const router = express.Router({ mergeParams: true });
router.use(requireAuth, requireLeadAccess());

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, u.name AS executive_name FROM calls c
       LEFT JOIN users u ON u.id = c.executive_id
       WHERE c.lead_id = ? ORDER BY c.call_date DESC`
    )
    .all(req.params.leadId);
  res.json({ calls: rows });
});

// Log a call made by the currently logged-in executive: what the customer said, when.
router.post("/", (req, res) => {
  const { customer_response, call_date } = req.body;

  const info = db
    .prepare(
      `INSERT INTO calls (lead_id, executive_id, customer_response, call_date)
       VALUES (?, ?, ?, COALESCE(?, datetime('now')))`
    )
    .run(req.params.leadId, req.user.id, customer_response || null, call_date || null);

  db.prepare("UPDATE leads SET updated_at = datetime('now') WHERE id = ?").run(req.params.leadId);

  const call = db
    .prepare(
      `SELECT c.*, u.name AS executive_name FROM calls c
       LEFT JOIN users u ON u.id = c.executive_id WHERE c.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json({ call });
});

router.delete("/:callId", (req, res) => {
  const existing = db.prepare("SELECT id FROM calls WHERE id = ? AND lead_id = ?").get(
    req.params.callId,
    req.params.leadId
  );
  if (!existing) return res.status(404).json({ error: "Call not found" });
  db.prepare("DELETE FROM calls WHERE id = ?").run(req.params.callId);
  res.status(204).end();
});

module.exports = router;
