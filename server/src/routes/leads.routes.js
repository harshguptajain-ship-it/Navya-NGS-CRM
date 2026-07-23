const express = require("express");
const ExcelJS = require("exceljs");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { requireLeadAccess, visibilityFilter } = require("../middleware/leadAccess");
const { getStages, isValidStage } = require("../utils/stages");
const { getStatuses, isValidStatus } = require("../utils/statuses");

const router = express.Router();

// Stages/statuses can change at runtime (admin add/rename/delete), so labels
// are looked up fresh per-request rather than cached at module load.
function stageLabels() {
  return Object.fromEntries(getStages().map((s) => [s.key, s.label]));
}
function statusLabels() {
  return Object.fromEntries(getStatuses().map((s) => [s.key, s.label]));
}

function userName(id) {
  if (!id) return null;
  return db.prepare("SELECT name FROM users WHERE id = ?").get(id)?.name || null;
}

// Builds a human-readable "X changed from A to B" log of every field that
// actually changed between the lead's prior state and its new (resolved)
// state, so edits are traceable without the user having to type anything.
function describeLeadChanges(existing, resolved) {
  const lines = [];
  const plainFields = [
    ["name", "Name"],
    ["phone", "Phone"],
    ["email", "Email"],
    ["address", "Address"],
    ["source", "Source"],
    ["notes", "Notes"],
  ];
  for (const [field, label] of plainFields) {
    const oldVal = existing[field] || "-";
    const newVal = resolved[field] || "-";
    if (String(oldVal) !== String(newVal)) {
      lines.push(`${label} changed from "${oldVal}" to "${newVal}"`);
    }
  }

  if (String(existing.status || "") !== String(resolved.status || "")) {
    const labels = statusLabels();
    const oldVal = existing.status ? labels[existing.status] || existing.status : "Not set";
    const newVal = resolved.status ? labels[resolved.status] || resolved.status : "Not set";
    lines.push(`Status changed from "${oldVal}" to "${newVal}"`);
  }
  if (String(existing.assigned_to || "") !== String(resolved.assigned_to || "")) {
    lines.push(`Assigned To changed from "${userName(existing.assigned_to) || "Unassigned"}" to "${userName(resolved.assigned_to) || "Unassigned"}"`);
  }
  if (String(existing.handling_by || "") !== String(resolved.handling_by || "")) {
    lines.push(`Handling By changed from "${userName(existing.handling_by) || "-"}" to "${userName(resolved.handling_by) || "-"}"`);
  }

  return lines.join("\n");
}

function addRemark(leadId, text, userId) {
  if (!text) return;
  db.prepare("INSERT INTO remarks (lead_id, remark_text, created_by) VALUES (?, ?, ?)").run(leadId, text, userId);
}

// Shared by the list view and the export — same filters, same visibility rule.
// created_from/created_to are full "YYYY-MM-DD HH:MM:SS" UTC bounds (the client
// converts its local-time date range to UTC before sending, to match how
// created_at is stored).
function buildLeadFilters(req) {
  const { stage, status, assigned_to, handling_by, source, q, created_from, created_to } = req.query;
  const vis = visibilityFilter(req.user);
  const clauses = [vis.clause];
  const params = { ...vis.params };

  if (stage) {
    clauses.push("l.stage = @stage");
    params.stage = stage;
  }
  if (status) {
    clauses.push("l.status = @status");
    params.status = status;
  }
  if (assigned_to === "unassigned") {
    clauses.push("l.assigned_to IS NULL");
  } else if (assigned_to) {
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
  if (created_from) {
    clauses.push("l.created_at >= @created_from");
    params.created_from = created_from;
  }
  if (created_to) {
    clauses.push("l.created_at < @created_to");
    params.created_to = created_to;
  }

  return { where: `WHERE ${clauses.join(" AND ")}`, params };
}

// Leads with a pending follow-up first (soonest due date on top), then leads
// with no follow-up at all, most recently created first.
const LEAD_ORDER = `ORDER BY (next_follow_up_date IS NULL) ASC, next_follow_up_date ASC, l.created_at DESC`;

// "Last remark" is the most recent entry in the remarks table — which now
// includes an auto-generated note for every field edit and stage change, on
// top of anything typed directly into the Remarks tab.
const LEAD_SELECT = `
  SELECT
    l.*,
    u1.name AS assigned_to_name,
    u2.name AS created_by_name,
    u3.name AS handling_by_name,
    (SELECT f.follow_up_date FROM followups f WHERE f.lead_id = l.id AND f.status = 'pending' ORDER BY f.follow_up_date ASC, f.id ASC LIMIT 1) AS next_follow_up_date,
    (SELECT f.id FROM followups f WHERE f.lead_id = l.id AND f.status = 'pending' ORDER BY f.follow_up_date ASC, f.id ASC LIMIT 1) AS next_follow_up_id,
    (SELECT remark_text FROM remarks WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) AS last_remark
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
  res.json({ stages: getStages() });
});

router.get("/statuses", requireAuth, (req, res) => {
  res.json({ statuses: getStatuses() });
});

// Distinct, non-empty source values currently in use — powers the Source filter dropdown.
// Grouped case-insensitively so "Telecaller" and "telecaller" show as one option.
// Scoped to leads the requesting user can actually see, same as everything else here.
router.get("/sources", requireAuth, (req, res) => {
  const vis = visibilityFilter(req.user);
  const rows = db
    .prepare(
      `SELECT source FROM leads l WHERE source IS NOT NULL AND source <> '' AND ${vis.clause}
       GROUP BY LOWER(source) ORDER BY source COLLATE NOCASE`
    )
    .all(vis.params);
  res.json({ sources: rows.map((r) => r.source) });
});

// List leads, optionally filtered by stage / status / assigned_to / handling_by /
// source / search text / created-date range. Executives only ever see leads they
// created, or are assigned/handling — admins see everything.
router.get("/", requireAuth, (req, res) => {
  const { where, params } = buildLeadFilters(req);
  const rows = db.prepare(`${LEAD_SELECT} ${where} ${LEAD_ORDER}`).all(params);
  res.json({ leads: rows });
});

// Export all leads (respecting the same filters + visibility as the list view) as an .xlsx file.
router.get("/export", requireAuth, async (req, res) => {
  const { where, params } = buildLeadFilters(req);
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
    { header: "Status", key: "status_label", width: 18 },
    { header: "Assigned To", key: "assigned_to_name", width: 18 },
    { header: "Handling By", key: "handling_by_name", width: 18 },
    { header: "Next Follow-up", key: "next_follow_up_date", width: 16 },
    { header: "Last Remark", key: "last_remark", width: 32 },
    { header: "Notes", key: "notes", width: 30 },
    { header: "Created At", key: "created_at", width: 20 },
    { header: "Created By", key: "created_by_name", width: 18 },
    { header: "Updated At", key: "updated_at", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: "A1", to: "Q1" };

  const labels = stageLabels();
  const statLabels = statusLabels();
  for (const r of rows) {
    sheet.addRow({
      ...r,
      stage_label: labels[r.stage] || r.stage,
      status_label: r.status ? statLabels[r.status] || r.status : "",
    });
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
  const vis = visibilityFilter(req.user, "l");
  const rows = db
    .prepare(
      `SELECT f.*, l.name AS lead_name, l.phone AS lead_phone, l.stage AS lead_stage
       FROM followups f
       JOIN leads l ON l.id = f.lead_id
       WHERE f.status = 'pending' AND ${vis.clause}
       ORDER BY f.follow_up_date ASC`
    )
    .all(vis.params);
  res.json({ followups: rows });
});

router.get("/:id", requireAuth, requireLeadAccess("id"), (req, res) => {
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
  const { name, phone, email, address, source, notes, status, assigned_to, handling_by } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Customer name is required" });
  }
  if (status && !isValidStatus(status)) {
    return res.status(400).json({ error: "Invalid status value" });
  }

  const dupe = findLeadByPhone(phone);
  if (dupe) {
    return res.status(409).json({
      error: `This phone number is already used by lead "${dupe.name}" (#${dupe.id})`,
    });
  }

  // Executives always own the lead they generate — only an admin can hand a
  // brand-new lead straight to someone else at creation time.
  const resolvedAssignedTo = req.user.role === "admin" ? assigned_to || null : req.user.id;

  let info;
  try {
    info = db
      .prepare(
        `INSERT INTO leads (name, phone, email, address, source, notes, status, assigned_to, handling_by, created_by)
         VALUES (@name, @phone, @email, @address, @source, @notes, @status, @assigned_to, @handling_by, @created_by)`
      )
      .run({
        name: name.trim(),
        phone: phone || null,
        email: email || null,
        address: address || null,
        source: source || null,
        notes: notes || null,
        status: status || null,
        assigned_to: resolvedAssignedTo,
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
  addRemark(info.lastInsertRowid, "Lead created", req.user.id);

  const lead = db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ lead });
});

router.put("/:id", requireAuth, requireLeadAccess("id"), (req, res) => {
  const existing = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Lead not found" });

  const { name, phone, email, address, source, notes, status, assigned_to, handling_by } = req.body;
  const nextPhone = phone ?? existing.phone;

  if (status !== undefined && status && !isValidStatus(status)) {
    return res.status(400).json({ error: "Invalid status value" });
  }

  // Executives can hand a lead up to an admin (or unassign it) but not sideways
  // to another executive — only an admin can do a peer-to-peer reassignment.
  if (req.user.role !== "admin" && assigned_to !== undefined && assigned_to) {
    const target = db.prepare("SELECT role FROM users WHERE id = ?").get(assigned_to);
    if (!target || target.role !== "admin") {
      return res.status(403).json({ error: "You can only reassign a lead to an admin" });
    }
  }

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

  const resolved = {
    id: req.params.id,
    name: name ?? existing.name,
    phone: nextPhone,
    email: email ?? existing.email,
    address: address ?? existing.address,
    source: source ?? existing.source,
    notes: notes ?? existing.notes,
    status: normalizeId(status, existing.status),
    assigned_to: normalizeId(assigned_to, existing.assigned_to),
    handling_by: normalizeId(handling_by, existing.handling_by),
  };

  try {
    db.prepare(
      `UPDATE leads SET
        name = @name, phone = @phone, email = @email, address = @address,
        source = @source, notes = @notes, status = @status,
        assigned_to = @assigned_to, handling_by = @handling_by,
        updated_at = datetime('now')
       WHERE id = @id`
    ).run(resolved);
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "A lead with this phone number already exists" });
    }
    throw err;
  }

  addRemark(req.params.id, describeLeadChanges(existing, resolved), req.user.id);

  const lead = db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).get(req.params.id);
  res.json({ lead });
});

// The core workflow action: move a lead to a new stage, logging history + timestamps.
router.put("/:id/stage", requireAuth, requireLeadAccess("id"), (req, res) => {
  const { stage, remarks } = req.body;
  if (!isValidStage(stage)) {
    return res.status(400).json({ error: "Invalid stage value" });
  }

  const existing = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Lead not found" });

  const labels = stageLabels();
  const oldLabel = labels[existing.stage] || existing.stage;
  const newLabel = labels[stage] || stage;
  const autoText = `Stage changed from "${oldLabel}" to "${newLabel}"` + (remarks && remarks.trim() ? ` — ${remarks.trim()}` : "");

  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE leads SET stage = @stage, stage_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = @id`
    ).run({ stage, id: req.params.id });

    db.prepare(
      `INSERT INTO stage_history (lead_id, old_stage, new_stage, remarks, changed_by) VALUES (?, ?, ?, ?, ?)`
    ).run(req.params.id, existing.stage, stage, remarks || null, req.user.id);
    addRemark(req.params.id, autoText, req.user.id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  const lead = db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).get(req.params.id);
  res.json({ lead });
});

// Deleting a lead outright is an admin-only "control" action; executives work
// leads (stage/remarks/follow-ups/calls) but don't remove them.
router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT id FROM leads WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Lead not found" });
  db.prepare("DELETE FROM leads WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

module.exports = router;
