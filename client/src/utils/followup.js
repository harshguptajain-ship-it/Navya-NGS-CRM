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

export function formatFollowUp(value) {
  if (!value) return "-";
  if (value.length <= 10) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
