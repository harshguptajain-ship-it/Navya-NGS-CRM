// Converts a local Date into the "YYYY-MM-DD HH:MM:SS" UTC string format that
// leads.created_at is stored in (SQLite's datetime('now') is UTC), so preset
// filters like "Today" match the browser's local calendar day, not UTC's.
function toSqlUtc(d) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function startOfLocalDay(base) {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0);
}

// preset: "" (all time) | "today" | "yesterday" | "week" (Mon-start) | "month"
export function createdRangeFor(preset) {
  const now = new Date();

  if (preset === "today") {
    const from = startOfLocalDay(now);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    return { created_from: toSqlUtc(from), created_to: toSqlUtc(to) };
  }
  if (preset === "yesterday") {
    const to = startOfLocalDay(now);
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    return { created_from: toSqlUtc(from), created_to: toSqlUtc(to) };
  }
  if (preset === "week") {
    const diffToMonday = (now.getDay() + 6) % 7; // Mon=0 ... Sun=6
    const from = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday));
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { created_from: toSqlUtc(from), created_to: toSqlUtc(to) };
  }
  if (preset === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
    return { created_from: toSqlUtc(from), created_to: toSqlUtc(to) };
  }
  return { created_from: "", created_to: "" };
}
