const express = require("express");
const ExcelJS = require("exceljs");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { STAGES, isValidStage } = require("../utils/stages");

const router = express.Router();

const STAGE_LABELS = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

// Leads with a pending follow-up first (soonest due date on top), then leads
// with no follow-up at all, most recently created first.
const LEAD_ORDER = `ORDER BY (next_follow_up_date IS NULL) ASC, next_follow_up_date ASC, l.created_at DESC`;

const LEAD_SELECT = `
  SELECT
    l.*,
    u1.name AS assigned_to_name,
    u2.name AS created_by_name,
    u3.name AS handling_by_name,
    (SELECT MIN(f.follow_up_date) FROM followups f WHERE f.lead_id = l.id AND f.status = 'pending') AS next_follow_up_date
  FROM leads l
  LEFT JOIN users u1 ON u1.id = l.assigned_to
  LEFT JOIN users u2 ON u2.id = l.created_by
  LEFT JOIN users u3 ON u3.id = l.handling_by
`;

// Dropdown fields send "" to mean "unset" — treat that as NULL, but a plain
// omitted field (undefined) should leave the existing value untouched.
function normalizeId(value, existingValue) {
  if (value === undefined) return existingValue;
  if (value === "" || value === null) return null;
  return value;
}

// Look up whether another lead already has this phone number (used to block duplicates).
function findLeadByPhone(phone, excludeId) {
  if (!phone || !phone.trim()) return null;
  const trimmed = phone.trim();
  const row = excludeId
    ? db.prepare("SELECT id, name FROM leads WHERE phone = ? AND id != ?").get(trimmed, excludeId)
    : db.prepare("SELECT id, name FROM leads WHERE phone = ?").get(trimmed);
  return row || null;
}

router.get("/stages", requireAuth, (req, res) => {
  res.json({ stages: STAGES });
});

// Distinct, non-empty source values currently in use — powers the Source filter dropdown.
// Grouped case-insensitively so "Telecaller" and "telecaller" show as one option.
router.get("/sources", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT source FROM leads WHERE source IS NOT NULL AND source <> ''
       GROUP BY LOWER(source) ORDER BY source COLLATE NOCASE`
    )
    .all();
  res.json({ sources: rows.map((r) => r.source) });
});

// List leads, optionally filtered by stage / assigned_to / handling_by / source / search text
router.get("/", requireAuth, (req, res) => {
  const { stage, assigned_to, handling_by, source, q } = req.query;
  const clauses = [];
  const params = {};

  if (stage) {
    clauses.push("l.stage = @stage");
    params.stage = stage;
  }
  if (assigned_to) {
    clauses.push("l.assigned_to = @assigned_to");
    params.assigned_to = assigned_to;
  }
  if (handling_by) {
    clauses.push("l.handling_by = @handling_by");
    params.handling_by = handling_by;
  }
  if (source) {
    clauses.push("LOWER(l.source) = LOWER(@source)");
    params.source = source;
  }
  if (q) {
    clauses.push("(l.name LIKE @q OR l.phone LIKE @q OR l.email LIKE @q)");
    params.q = `%${q}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`${LEAD_SELECT} ${where} ${LEAD_ORDER}`).all(params);
  res.json({ leads: rows });
});

// Export all leads (respecting the same filters as the list view) as an .xlsx file.
router.get("/export", requireAuth, async (req, res) => {
  const { stage, assigned_to, handling_by, source, q } = req.query;
  const clauses = [];
  const params = {};

  if (stage) {
    clauses.push("l.stage = @stage");
    params.stage = stage;
  }
  if (assigned_to) {
    clauses.push("l.assigned_to = @assigned_to");
    params.assigned_to = assigned_to;
  }
  if (handling_by) {
    clauses.push("l.handling_by = @handling_by");
    params.handling_by = handling_by;
  }
  if (source) {
    clauses.push("LOWER(l.source) = LOWER(@source)");
    params.source = source;
  }
  if (q) {
    clauses.push("(l.name LIKE @q OR l.phone LIKE @q OR l.email LIKE @q)");
    params.q = `%${q}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`${LEAD_SELECT} ${where} ${LEAD_ORDER}`).all(params);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leads");
  sheet.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Name", key: "name", width: 24 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Email", key: "email", width: 24 },
    { header: "Address", key: "address", width: 28 },
    { header: "Source", key: "source", width: 16 },
    { header: "Stage", key: "stage_label", width: 26 },
    { header: "Stage Updated At", key: "stage_updated_at", width: 20 },
    { header: "Assigned To", key: "assigned_to_name", width: 18 },
    { header: "Handling By", key: "handling_by_name", width: 18 },
    { header: "Next Follow-up", key: "next_follow_up_date", width: 16 },
    { header: "Notes", key: "notes", width: 30 },
    { header: "Created At", key: "created_at", width: 20 },
    { header: "Created By", key: "created_by_name", width: 18 },
    { header: "Updated At", key: "updated_at", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: "A1", to: "O1" };

  for (const r of rows) {
    sheet.addRow({ ...r, stage_label: STAGE_LABELS[r.stage] || r.stage });
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="leads-export-${new Date().toISOString().slice(0, 10)}.xlsx"`
  );
  await workbook.xlsx.write(res);
  res.end();
});

// Leads with a pending follow-up due today or earlier (overdue) or upcoming
router.get("/followups/upcoming", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT f.*, l.name AS lead_name, l.phone AS lead_phone, l.stage AS lead_stage
       FROM followups f
       JOIN leads l ON l.id = f.lead_id
       WHERE f.status = 'pending'
       ORDER BY f.follow_up_date ASC`
    )
    .all();
  res.json({ followups: rows });
});

router.get("/:id", requireAuth, (req, res) => {
  const lead = db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).get(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const followups = db
    .prepare(
      `SELECT f.*, u.name AS created_by_name FROM followups f
       LEFT JOIN users u ON u.id = f.created_by
       WHERE f.lead_id = ? ORDER BY f.follow_up_date DESC`
    )
    .all(req.params.id);

  const calls = db
    .prepare(
      `SELECT c.*, u.name AS executive_name FROM calls c
       LEFT JOIN users u ON u.id = c.executive_id
       WHERE c.lead_id = ? ORDER BY c.call_date DESC`
    )
    .all(req.params.id);

  const stageHistory = db
    .prepare(
      `SELECT h.*, u.name AS changed_by_name FROM stage_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.lead_id = ? ORDER BY h.changed_at DESC`
    )
    .all(req.params.id);

  const remarks = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name FROM remarks r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.lead_id = ? ORDER BY r.created_at DESC`
    )
    .all(req.params.id);

  res.json({ lead, followups, calls, stageHistory, remarks });
});

router.post("/", requireAuth, (req, res) => {
  const { name, phone, email, address, source, notes, assigned_to, handling_by } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Customer name is required" });
  }

  const dupe = findLeadByPhone(phone);
  if (dupe) {
    return res.status(409).json({
      error: `This phone number is already used by lead "${dupe.name}" (#${dupe.id})`,
    });
  }

  let info;
  try {
    info = db
      .prepare(
        `INSERT INTO leads (name, phone, email, address, source, notes, assigned_to, handling_by, created_by)
         VALUES (@name, @phone, @email, @address, @source, @notes, @assigned_to, @handling_by, @created_by)`
      )
      .run({
        name: name.trim(),
        phone: phone || null,
        email: email || null,
        address: address || null,
        source: source || null,
        notes: notes || null,
        assigned_to: assigned_to || null,
        handling_by: handling_by || null,
        created_by: req.user.id,
      });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "A lead with this phone number already exists" });
    }
    throw err;
  }

  db.prepare(
    "INSERT INTO stage_history (lead_id, old_stage, new_stage, remarks, changed_by) VALUES (?, NULL, 'new', 'Lead created', ?)"
  ).run(info.lastInsertRowid, req.user.id);

  const lead = db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ lead });
});

router.put("/:id", requireAuth, (req, res) => {
  const existing = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Lead not found" });

  const { name, phone, email, address, source, notes, assigned_to, handling_by } = req.body;
  const nextPhone = phone ?? existing.phone;

  // Only re-check for duplicates if the phone is actually being changed — partial
  // updates (e.g. just reassigning "Handling By") shouldn't get blocked by a
  // phone collision that already existed before this lead was touched.
  const phoneChanged = phone !== undefined && (phone || null) !== (existing.phone || null);
  if (phoneChanged) {
    const dupe = findLeadByPhone(nextPhone, req.params.id);
    if (dupe) {
      return res.status(409).json({
        error: `This phone number is already used by lead "${dupe.name}" (#${dupe.id})`,
      });
    }
  }

  try {
    db.prepare(
      `UPDATE leads SET
        name = @name, phone = @phone, email = @email, address = @address,
        source = @source, notes = @notes, assigned_to = @assigned_to, handling_by = @handling_by,
        updated_at = datetime('now')
       WHERE id = @id`
    ).run({
      id: req.params.id,
      name: name ?? existing.name,
      phone: nextPhone,
      email: email ?? existing.email,
      address: address ?? existing.address,
      source: source ?? existing.source,
      notes: notes ?? existing.notes,
      assigned_to: normalizeId(assigned_to, existing.assigned_to),
      handling_by: normalizeId(handling_by, existing.handling_by),
    });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "A lead with this phone number already exists" });
    }
    throw err;
  }

  const lead = db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).get(req.params.id);
  res.json({ lead });
});

// The core workflow action: move a lead to a new stage, logging history + timestamps.
router.put("/:id/stage", requireAuth, (req, res) => {
  const { stage, remarks } = req.body;
  if (!isValidStage(stage)) {
    return res.status(400).json({ error: "Invalid stage value" });
  }

  const existing = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Lead not found" });

  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE leads SET stage = @stage, stage_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = @id`
    ).run({ stage, id: req.params.id });

    db.prepare(
      `INSERT INTO stage_history (lead_id, old_stage, new_stage, remarks, changed_by) VALUES (?, ?, ?, ?, ?)`
    ).run(req.params.id, existing.stage, stage, remarks || null, req.user.id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  const lead = db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).get(req.params.id);
  res.json({ lead });
});

router.delete("/:id", requireAuth, (req, res) => {
  const existing = db.prepare("SELECT id FROM leads WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Lead not found" });
  db.prepare("DELETE FROM leads WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

module.exports = router;
