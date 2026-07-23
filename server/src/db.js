const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || "./data/crm.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'executive', -- 'admin' | 'executive'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  source TEXT,
  notes TEXT,
  stage TEXT NOT NULL DEFAULT 'new',
  stage_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT,
  assigned_to INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stage_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  old_stage TEXT,
  new_stage TEXT NOT NULL,
  remarks TEXT,
  changed_by INTEGER REFERENCES users(id),
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  follow_up_date TEXT NOT NULL,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'done' | 'cancelled'
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  executive_id INTEGER REFERENCES users(id),
  call_date TEXT NOT NULL DEFAULT (datetime('now')),
  customer_response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS remarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  remark_text TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stages (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Separate from "stage" (pipeline position): a lead's interest/outcome status
-- (Interested, Not Interested, ...), admin-managed the same way stages are.
CREATE TABLE IF NOT EXISTS statuses (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Tracks one-off data migrations (backfills, etc.) so they run exactly once
-- rather than every server start.
CREATE TABLE IF NOT EXISTS migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fully separate from "remarks": admin-only notes on a lead. Executives never
-- see this table's contents (not gated in the UI alone — the API only
-- exposes it to admins).
CREATE TABLE IF NOT EXISTS admin_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_followups_lead ON followups(lead_id);
CREATE INDEX IF NOT EXISTS idx_followups_date ON followups(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_calls_lead ON calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_lead ON stage_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_remarks_lead ON remarks(lead_id);
CREATE INDEX IF NOT EXISTS idx_admin_notes_lead ON admin_notes(lead_id);
`);

// --- Migrations for columns added after the initial release ---
const leadColumns = db.prepare("PRAGMA table_info(leads)").all().map((c) => c.name);
if (!leadColumns.includes("handling_by")) {
  db.exec("ALTER TABLE leads ADD COLUMN handling_by INTEGER REFERENCES users(id)");
}
if (!leadColumns.includes("status")) {
  db.exec("ALTER TABLE leads ADD COLUMN status TEXT");
}
db.exec("CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)");

// Seed the stages table from the original hardcoded lifecycle, once, so
// existing deployments keep the same stages/order they already had.
const stageCount = db.prepare("SELECT COUNT(*) AS c FROM stages").get().c;
if (stageCount === 0) {
  const DEFAULT_STAGES = [
    { key: "new", label: "New Lead" },
    { key: "follow_up", label: "Follow-up in Progress" },
    { key: "ready_for_documents", label: "Ready - Documents Requested" },
    { key: "documents_received", label: "Documents Received" },
    { key: "file_logged", label: "File Logged" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ];
  const insertStage = db.prepare("INSERT INTO stages (key, label, sort_order) VALUES (?, ?, ?)");
  DEFAULT_STAGES.forEach((s, i) => insertStage.run(s.key, s.label, i));
}

// Seed a starting set of statuses — admin can add/rename/remove more from the Stages page.
const statusCount = db.prepare("SELECT COUNT(*) AS c FROM statuses").get().c;
if (statusCount === 0) {
  const DEFAULT_STATUSES = [
    { key: "interested", label: "Interested" },
    { key: "not_interested", label: "Not Interested" },
  ];
  const insertStatus = db.prepare("INSERT INTO statuses (key, label, sort_order) VALUES (?, ?, ?)");
  DEFAULT_STATUSES.forEach((s, i) => insertStatus.run(s.key, s.label, i));
}

// One-time backfill: the Remarks tab used to only surface stage-change notes
// typed into stage_history.remarks; leads.last_remark now reads exclusively
// from the remarks table, so copy that older text over once so it doesn't
// silently disappear from "Last Remark" / "All Notes" for existing leads.
function hasMigration(name) {
  return !!db.prepare("SELECT 1 FROM migrations WHERE name = ?").get(name);
}
const BACKFILL_NAME = "backfill_stage_history_remarks_v1";
if (!hasMigration(BACKFILL_NAME)) {
  const rows = db
    .prepare("SELECT * FROM stage_history WHERE remarks IS NOT NULL AND remarks <> ''")
    .all();
  const insert = db.prepare(
    "INSERT INTO remarks (lead_id, remark_text, created_by, created_at) VALUES (?, ?, ?, ?)"
  );
  for (const h of rows) {
    insert.run(h.lead_id, h.remarks, h.changed_by, h.changed_at);
  }
  db.prepare("INSERT INTO migrations (name) VALUES (?)").run(BACKFILL_NAME);
}

// Enforce unique phone numbers (blank/NULL phones are exempt so they don't collide).
try {
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone_unique ON leads(phone) WHERE phone IS NOT NULL AND phone <> ''"
  );
} catch (err) {
  console.warn("Could not create unique phone index (duplicate phone numbers already exist):", err.message);
}

// Seed a default admin so there's always a way to log in on first run.
const adminEmail = (process.env.ADMIN_EMAIL || "admin@crm.local").toLowerCase();
const existingAdmin = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);
if (!existingAdmin) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || "admin123", 10);
  db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')"
  ).run(process.env.ADMIN_NAME || "Administrator", adminEmail, hash);
  console.log(`Seeded admin user: ${adminEmail} / ${process.env.ADMIN_PASSWORD || "admin123"}`);
}

module.exports = db;
