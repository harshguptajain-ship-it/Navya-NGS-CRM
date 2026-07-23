const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { requireLeadAccess } = require("../middleware/leadAccess");

const router = express.Router({ mergeParams: true });
router.use(requireAuth, requireLeadAccess());

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name FROM remarks r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.lead_id = ? ORDER BY r.created_at DESC`
    )
    .all(req.params.leadId);
  res.json({ remarks: rows });
});

// Add a new, standalone remark entry. Each call creates its own row so the
// full history of remarks over time is preserved (nothing gets overwritten).
router.post("/", (req, res) => {
  const { remark_text } = req.body;
  if (!remark_text || !remark_text.trim()) {
    return res.status(400).json({ error: "remark_text is required" });
  }

  const info = db
    .prepare("INSERT INTO remarks (lead_id, remark_text, created_by) VALUES (?, ?, ?)")
    .run(req.params.leadId, remark_text.trim(), req.user.id);

  db.prepare("UPDATE leads SET updated_at = datetime('now') WHERE id = ?").run(req.params.leadId);

  const remark = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name FROM remarks r
       LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json({ remark });
});

// Editing/deleting an existing remark is admin-only — anyone can add a new
// one, but the log itself (including auto-generated change entries) is only
// correctable by an admin, not silently rewritten by whoever's viewing it.
router.put("/:remarkId", requireAdmin, (req, res) => {
  const { remark_text } = req.body;
  if (!remark_text || !remark_text.trim()) {
    return res.status(400).json({ error: "remark_text is required" });
  }
  const existing = db.prepare("SELECT id FROM remarks WHERE id = ? AND lead_id = ?").get(
    req.params.remarkId,
    req.params.leadId
  );
  if (!existing) return res.status(404).json({ error: "Remark not found" });

  db.prepare("UPDATE remarks SET remark_text = ? WHERE id = ?").run(remark_text.trim(), req.params.remarkId);

  const remark = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name FROM remarks r
       LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ?`
    )
    .get(req.params.remarkId);
  res.json({ remark });
});

router.delete("/:remarkId", requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT id FROM remarks WHERE id = ? AND lead_id = ?").get(
    req.params.remarkId,
    req.params.leadId
  );
  if (!existing) return res.status(404).json({ error: "Remark not found" });
  db.prepare("DELETE FROM remarks WHERE id = ?").run(req.params.remarkId);
  res.status(204).end();
});

module.exports = router;
