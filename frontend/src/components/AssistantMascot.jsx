// The SportsCal setup-assistant mascot ("Coach") — a flat SVG so it stays
// crisp at any size and follows the skin: body uses --accent (green in the
// classic skin, trust-blue under beta); the headset is a fixed amber accent.
export function AssistantMascot({ size = 40, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" style={style}>
      <circle cx="32" cy="33" r="21" fill="var(--accent)" />
      <circle cx="25" cy="31" r="3.3" fill="#fff" />
      <circle cx="39" cy="31" r="3.3" fill="#fff" />
      <path d="M24 39c3 3 13 3 16 0" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M15 31a17 17 0 0 1 34 0" stroke="#D97706" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <rect x="11" y="29" width="7" height="10" rx="3.5" fill="#D97706" />
      <rect x="46" y="29" width="7" height="10" rx="3.5" fill="#D97706" />
    </svg>
  );
}
