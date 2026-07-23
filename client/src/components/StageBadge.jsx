import React from "react";

// Stage labels/colors are admin-managed (see the Stages page + useStages hook).
// Color is picked by the stage's position in the current order (colorIndex,
// from useStages().colorIndexOf) so every stage visible at once is distinct —
// falls back to hashing the key if no index is given.
const PALETTE = [
  { bg: "#e0e7ff", fg: "#3730a3" },
  { bg: "#fef3c7", fg: "#92400e" },
  { bg: "#dbeafe", fg: "#1e40af" },
  { bg: "#cffafe", fg: "#155e75" },
  { bg: "#ede9fe", fg: "#5b21b6" },
  { bg: "#dcfce7", fg: "#166534" },
  { bg: "#fee2e2", fg: "#991b1b" },
  { bg: "#fce7f3", fg: "#9d174d" },
  { bg: "#ffedd5", fg: "#9a3412" },
  { bg: "#e2e8f0", fg: "#334155" },
];

function hashColor(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export default function StageBadge({ stage, label, colorIndex }) {
  const c = Number.isInteger(colorIndex) ? PALETTE[colorIndex % PALETTE.length] : hashColor(stage || "");
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      {label ?? stage}
    </span>
  );
}
