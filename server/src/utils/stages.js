const db = require("../db");

// Stages are stored in the `stages` table (key, label, sort_order) so an admin
// can add, rename, reorder, or remove them at runtime — order matters for the
// UI stepper, but any stage can jump to any other stage (e.g. rejected can
// happen at any point).

function getStages() {
  return db.prepare("SELECT key, label FROM stages ORDER BY sort_order ASC, rowid ASC").all();
}

function getStageKeys() {
  return getStages().map((s) => s.key);
}

function isValidStage(key) {
  return getStageKeys().includes(key);
}

function slugify(label) {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "stage"
  );
}

// Generates a unique stage key from a label, e.g. "Interested" -> "interested",
// falling back to "interested_2", "interested_3", ... on collision.
function uniqueKeyFromLabel(label) {
  const base = slugify(label);
  const existing = new Set(getStageKeys());
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function createStage(label) {
  const trimmed = (label || "").trim();
  if (!trimmed) throw new Error("Label is required");

  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM stages").get().m;
  const key = uniqueKeyFromLabel(trimmed);
  db.prepare("INSERT INTO stages (key, label, sort_order) VALUES (?, ?, ?)").run(
    key,
    trimmed,
    maxOrder + 1
  );
  return { key, label: trimmed };
}

function renameStage(key, label) {
  const trimmed = (label || "").trim();
  if (!trimmed) throw new Error("Label is required");
  const existing = db.prepare("SELECT key FROM stages WHERE key = ?").get(key);
  if (!existing) throw new Error("Stage not found");
  db.prepare("UPDATE stages SET label = ? WHERE key = ?").run(trimmed, key);
  return { key, label: trimmed };
}

function deleteStage(key) {
  const existing = db.prepare("SELECT key FROM stages WHERE key = ?").get(key);
  if (!existing) throw new Error("Stage not found");

  const totalStages = db.prepare("SELECT COUNT(*) AS c FROM stages").get().c;
  if (totalStages <= 1) throw new Error("At least one stage must remain");

  const leadsUsingIt = db.prepare("SELECT COUNT(*) AS c FROM leads WHERE stage = ?").get(key).c;
  if (leadsUsingIt > 0) {
    throw new Error(
      `Cannot delete: ${leadsUsingIt} lead(s) are currently on this stage. Move them to another stage first.`
    );
  }

  db.prepare("DELETE FROM stages WHERE key = ?").run(key);
}

// order: array of every stage key, in the desired display order.
function reorderStages(order) {
  const current = new Set(getStageKeys());
  if (!Array.isArray(order) || order.length !== current.size || !order.every((k) => current.has(k))) {
    throw new Error("Reorder list must contain every existing stage key exactly once");
  }
  const update = db.prepare("UPDATE stages SET sort_order = ? WHERE key = ?");
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
  getStages,
  getStageKeys,
  isValidStage,
  createStage,
  renameStage,
  deleteStage,
  reorderStages,
};
