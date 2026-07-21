const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router({ mergeParams: true });

router.get("/", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT f.*, u.name AS created_by_name FROM followups f
       LEFT JOIN users u ON u.id = f.created_by
       WHERE f.lead_id = ? ORDER BY f.follow_up_date DESC`
    )
    .all(req.params.leadId);
  res.json({ followups: rows });
});

router.post("/", requireAuth, (req, res) => {
  const { follow_up_date, remarks } = req.body;
  if (!follow_up_date) return res.status(400).json({ error: "follow_up_date is required" });

  const lead = db.prepare("SELECT id FROM leads WHERE id = ?").get(req.params.leadId);
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const info = db
    .prepare(
      `INSERT INTO followups (lead_id, follow_up_date, remarks, created_by) VALUES (?, ?, ?, ?)`
    )
    .run(req.params.leadId, follow_up_date, remarks || null, req.user.id);

  db.prepare("UPDATE leads SET updated_at = datetime('now') WHERE id = ?").run(req.params.leadId);

  const followup = db.prepare("SELECT * FROM followups WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ followup });
});

// Update a follow-up: reschedule the date, edit remarks, or mark done/cancelled.
router.put("/:followupId", requireAuth, (req, res) => {
  const existing = db.prepare("SELECT * FROM followups WHERE id = ? AND lead_id = ?").get(
    req.params.followupId,
    req.params.leadId
  );
  if (!existing) return res.status(404).json({ error: "Follow-up not found" });

  const { follow_up_date, remarks, status } = req.body;
  db.prepare(
    `UPDATE followups SET
      follow_up_date = @follow_up_date, remarks = @remarks, status = @status,
      updated_at = datetime('now')
     WHERE id = @id`
  ).run({
    id: req.params.followupId,
    follow_up_date: follow_up_date ?? existing.follow_up_date,
    remarks: remarks ?? existing.remarks,
    status: status ?? existing.status,
  });

  db.prepare("UPDATE leads SET updated_at = datetime('now') WHERE id = ?").run(req.params.leadId);

  const followup = db.prepare("SELECT * FROM followups WHERE id = ?").get(req.params.followupId);
  res.json({ followup });
});

router.delete("/:followupId", requireAuth, (req, res) => {
  const existing = db.prepare("SELECT id FROM followups WHERE id = ? AND lead_id = ?").get(
    req.params.followupId,
    req.params.leadId
  );
  if (!existing) return res.status(404).json({ error: "Follow-up not found" });
  db.prepare("DELETE FROM followups WHERE id = ?").run(req.params.followupId);
  res.status(204).end();
});

module.exports = router;
