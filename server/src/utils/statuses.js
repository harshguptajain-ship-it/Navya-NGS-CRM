const db = require("../db");

// Statuses (Interested / Not Interested / ...) track a lead's outcome/interest
// separately from its stage (pipeline position) — a lead can be "Follow-up in
// Progress" (stage) and "Interested" (status) at the same time. Same
// admin-managed shape as stages: add/rename/reorder/delete at runtime.

function getStatuses() {
  return db.prepare("SELECT key, label FROM statuses ORDER BY sort_order ASC, rowid ASC").all();
}

function getStatusKeys() {
  return getStatuses().map((s) => s.key);
}

function isValidStatus(key) {
  return getStatusKeys().includes(key);
}

function slugify(label) {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "status"
  );
}

function uniqueKeyFromLabel(label) {
  const base = slugify(label);
  const existing = new Set(getStatusKeys());
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function createStatus(label) {
  const trimmed = (label || "").trim();
  if (!trimmed) throw new Error("Label is required");

  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM statuses").get().m;
  const key = uniqueKeyFromLabel(trimmed);
  db.prepare("INSERT INTO statuses (key, label, sort_order) VALUES (?, ?, ?)").run(
    key,
    trimmed,
    maxOrder + 1
  );
  return { key, label: trimmed };
}

function renameStatus(key, label) {
  const trimmed = (label || "").trim();
  if (!trimmed) throw new Error("Label is required");
  const existing = db.prepare("SELECT key FROM statuses WHERE key = ?").get(key);
  if (!existing) throw new Error("Status not found");
  db.prepare("UPDATE statuses SET label = ? WHERE key = ?").run(trimmed, key);
  return { key, label: trimmed };
}

function deleteStatus(key) {
  const existing = db.prepare("SELECT key FROM statuses WHERE key = ?").get(key);
  if (!existing) throw new Error("Status not found");

  const leadsUsingIt = db.prepare("SELECT COUNT(*) AS c FROM leads WHERE status = ?").get(key).c;
  if (leadsUsingIt > 0) {
    throw new Error(
      `Cannot delete: ${leadsUsingIt} lead(s) currently have this status. Change them to another status first.`
    );
  }

  db.prepare("DELETE FROM statuses WHERE key = ?").run(key);
}

// order: array of every status key, in the desired display order.
function reorderStatuses(order) {
  const current = new Set(getStatusKeys());
  if (!Array.isArray(order) || order.length !== current.size || !order.every((k) => current.has(k))) {
    throw new Error("Reorder list must contain every existing status key exactly once");
  }
  const update = db.prepare("UPDATE statuses SET sort_order = ? WHERE key = ?");
  db.exec("BEGIN");
  try {
    order.forEach((key, i) => update.run(i, key));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

module.exports = {
  getStatuses,
  getStatusKeys,
  isValidStatus,
  createStatus,
  renameStatus,
  deleteStatus,
  reorderStatuses,
};
