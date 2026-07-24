import React from "react";

function pad(n) {
  return String(n).padStart(2, "0");
}

// A datetime-local replacement that always renders in 12-hour AM/PM — native
// datetime-local pickers follow the OS/browser locale (often 24-hour on
// Windows) and there's no HTML/CSS way to force 12-hour display on those.
// Value/onChange still use the same "YYYY-MM-DDTHH:MM" (24-hour) string so
// this is a drop-in replacement everywhere follow-up dates are read/written.
export default function DateTime12Input({ value, onChange, required }) {
  const [datePart, timePart] = value ? value.split("T") : ["", ""];
  const [hStr, mStr] = timePart ? timePart.split(":") : ["", ""];
  const h24 = hStr === "" ? null : parseInt(hStr, 10);
  const minute = mStr || "00";
  // Default to a real "12:00 AM" reading rather than a "HH" placeholder —
  // matches how the minute select already defaults to "00" instead of blank.
  const hour12 = h24 === null ? 12 : h24 % 12 || 12;
  const ampm = h24 === null ? "AM" : h24 >= 12 ? "PM" : "AM";

  function emit(nextDate, nextHour12, nextMinute, nextAmPm) {
    if (!nextDate || !nextHour12) {
      onChange("");
      return;
    }
    let h = parseInt(nextHour12, 10) % 12;
    if (nextAmPm === "PM") h += 12;
    onChange(`${nextDate}T${pad(h)}:${nextMinute}`);
  }

  return (
    <div className="datetime12">
      <input
        type="date"
        value={datePart}
        onChange={(e) => emit(e.target.value, hour12 || 12, minute, ampm)}
        required={required}
      />
      <select
        className="datetime12-select"
        value={hour12}
        onChange={(e) => emit(datePart, e.target.value, minute, ampm)}
        required={required}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="datetime12-colon">:</span>
      <select
        className="datetime12-select"
        value={minute}
        onChange={(e) => emit(datePart, hour12 || 12, e.target.value, ampm)}
      >
        {Array.from({ length: 60 }, (_, i) => pad(i)).map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <select
        className="datetime12-select datetime12-ampm"
        value={ampm}
        onChange={(e) => emit(datePart, hour12 || 12, minute, e.target.value)}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
