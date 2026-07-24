// Follow-ups are stored as either a plain date ("YYYY-MM-DD", legacy rows) or a
// full local datetime ("YYYY-MM-DDTHH:MM", from <input type="datetime-local">).
// These helpers compare/format both shapes consistently without any server-side
// timezone conversion — "now" is built from local time fields to match the
// datetime-local input's own (timezone-less) string format.

export function localNowString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const pad = (n) => String(n).padStart(2, "0");

// DD-MM-YYYY — the Indian date convention this CRM's team expects everywhere,
// instead of the ISO YYYY-MM-DD / US "Jul 26, 2026" formats a browser default
// would otherwise produce.
function formatDMY(d) {
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function format12Hour(d) {
  let h = d.getHours();
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${suffix}`;
}

// Server-generated timestamps (created_at, updated_at, call_date, etc.) are
// written by SQLite's datetime('now'), which is always UTC, as a bare
// "YYYY-MM-DD HH:MM:SS" string with no timezone marker. Parsed naively that
// gets treated as local time and displayed hours off from the real time it
// happened — so parse it explicitly as UTC and render it in the viewer's
// local time instead.
export function formatDateTime(value) {
  if (!value) return "-";
  const isoUtc = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return value;
  return `${formatDMY(d)} ${format12Hour(d)}`;
}

export function formatFollowUp(value) {
  if (!value) return "-";
  // Legacy date-only rows ("YYYY-MM-DD", no time) — reformat just the date part.
  if (value.length <= 10) {
    const [y, m, dd] = value.split("-");
    return `${dd}-${m}-${y}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${formatDMY(d)} ${format12Hour(d)}`;
}

// Buckets a follow-up date for the Follow-ups tab: "overdue" (any day before
// today), "today", or "upcoming" (a future day) — by calendar date only, not
// time-of-day, so a follow-up due earlier today isn't "overdue" until tomorrow.
export function followUpGroup(value) {
  if (!value) return null;
  const today = localNowString().slice(0, 10);
  const date = value.slice(0, 10);
  if (date < today) return "overdue";
  if (date === today) return "today";
  return "upcoming";
}

// Returns whether a follow-up should be visually flagged, and whether it's
// "today" (not yet due) or already "overdue" (past date, or past time today).
export function followUpDueState(value) {
  if (!value) return { isDue: false, label: "" };

  const now = localNowString();
  const today = now.slice(0, 10);
  const date = value.slice(0, 10);
  const hasTime = value.length > 10;

  if (date < today) return { isDue: true, label: "overdue" };
  if (date === today) {
    const timePassed = hasTime && value <= now;
    return { isDue: true, label: timePassed ? "overdue" : "today" };
  }
  return { isDue: false, label: "" };
}
