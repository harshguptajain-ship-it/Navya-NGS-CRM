import React from "react";

// Simple monogram badge standing in for a company logo — no image asset
// needed, scales cleanly at any size, and matches the app's blue accent.
export default function Logo({ size = 32, showText = true, textSize = 16, dark = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.3 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="logoGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#4338ca" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#logoGradient)" />
        <text
          x="32"
          y="45"
          fontFamily="Segoe UI, Arial, sans-serif"
          fontSize="34"
          fontWeight="700"
          fill="white"
          textAnchor="middle"
        >
          N
        </text>
      </svg>
      {showText && (
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <span style={{ fontWeight: 700, fontSize: textSize, color: dark ? "#1b2733" : "white" }}>
            Navya NGS
          </span>
          <span style={{ fontSize: textSize * 0.6, opacity: 0.7, color: dark ? "#1b2733" : "white" }}>
            Pvt Ltd &middot; CRM
          </span>
        </span>
      )}
    </div>
  );
}
