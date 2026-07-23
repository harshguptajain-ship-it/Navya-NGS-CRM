const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

// Fully separate from remarks — every route here is admin-only, so an
// executive never sees this data exists, let alone its contents.
const router = express.Router({ mergeParams: true });
router.use(requireAuth, requireAdmin);

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT n.*, u.name AS created_by_name FROM admin_notes n
       LEFT JOIN users u ON u.id = n.created_by
       WHERE n.lead_id = ? ORDER BY n.created_at DESC`
    )
    .all(req.params.leadId);
  res.json({ notes: rows });
});

router.post("/", (req, res) => {
  const { note_text } = req.body;
  if (!note_text || !note_text.trim()) {
    return res.status(400).json({ error: "note_text is required" });
  }

  const lead = db.prepare("SELECT id FROM leads WHERE id = ?").get(req.params.leadId);
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const info = db
    .prepare("INSERT INTO admin_notes (lead_id, note_text, created_by) VALUES (?, ?, ?)")
    .run(req.params.leadId, note_text.trim(), req.user.id);

  const note = db
    .prepare(
      `SELECT n.*, u.name AS created_by_name FROM admin_notes n
       LEFT JOIN users u ON u.id = n.created_by WHERE n.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json({ note });
});

router.put("/:noteId", (req, res) => {
  const { note_text } = req.body;
  if (!note_text || !note_text.trim()) {
    return res.status(400).json({ error: "note_text is required" });
  }
  const existing = db.prepare("SELECT id FROM admin_notes WHERE id = ? AND lead_id = ?").get(
    req.params.noteId,
    req.params.leadId
  );
  if (!existing) return res.status(404).json({ error: "Note not found" });

  db.prepare("UPDATE admin_notes SET note_text = ?, updated_at = datetime('now') WHERE id = ?").run(
    note_text.trim(),
    req.params.noteId
  );

  const note = db
    .prepare(
      `SELECT n.*, u.name AS created_by_name FROM admin_notes n
       LEFT JOIN users u ON u.id = n.created_by WHERE n.id = ?`
    )
    .get(req.params.noteId);
  res.json({ note });
});

router.delete("/:noteId", (req, res) => {
  const existing = db.prepare("SELECT id FROM admin_notes WHERE id = ? AND lead_id = ?").get(
    req.params.noteId,
    req.params.leadId
  );
  if (!existing) return res.status(404).json({ error: "Note not found" });
  db.prepare("DELETE FROM admin_notes WHERE id = ?").run(req.params.noteId);
  res.status(204).end();
});

module.exports = router;
