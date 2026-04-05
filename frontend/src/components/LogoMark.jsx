export function LogoMark({ size = 32 }) {
  const scale = size / 56;
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="bball-clip-logo">
          <circle cx="37" cy="37" r="7.5"/>
        </clipPath>
        <clipPath id="soccer-clip-logo">
          <circle cx="19" cy="37" r="7.5"/>
        </clipPath>
      </defs>
      <rect x="4" y="12" width="48" height="40" rx="8" fill="#1a2540"/>
      <rect x="4" y="12" width="48" height="13" rx="8" fill="#00d68f"/>
      <rect x="4" y="19" width="48" height="6" fill="#00d68f"/>
      <rect x="17" y="7" width="4" height="11" rx="2" fill="#00b377"/>
      <rect x="35" y="7" width="4" height="11" rx="2" fill="#00b377"/>
      <circle cx="19" cy="37" r="8" stroke="#00d68f" stroke-width="1.5" fill="none"/>
      <g clipPath="url(#soccer-clip-logo)">
        <polygon points="19,33 22,35.2 21,38.5 17,38.5 16,35.2" fill="none" stroke="#00d68f" strokeWidth="1" strokeLinejoin="round"/>
        <line x1="19" y1="33" x2="19" y2="29" stroke="#00d68f" strokeWidth="0.8"/>
        <line x1="22" y1="35.2" x2="26.5" y2="33.5" stroke="#00d68f" strokeWidth="0.8"/>
        <line x1="21" y1="38.5" x2="24.5" y2="41" stroke="#00d68f" strokeWidth="0.8"/>
        <line x1="17" y1="38.5" x2="13.5" y2="41" stroke="#00d68f" strokeWidth="0.8"/>
        <line x1="16" y1="35.2" x2="11.5" y2="33.5" stroke="#00d68f" strokeWidth="0.8"/>
      </g>
      <circle cx="37" cy="37" r="8" stroke="#00d68f" strokeWidth="1.5" fill="none"/>
      <g clipPath="url(#bball-clip-logo)">
        <line x1="29" y1="37" x2="45" y2="37" stroke="#00d68f" strokeWidth="1"/>
        <line x1="37" y1="29" x2="37" y2="45" stroke="#00d68f" strokeWidth="1"/>
        <path d="M30.5 30.5 Q34 37 30.5 43.5" stroke="#00d68f" strokeWidth="1" fill="none"/>
        <path d="M43.5 30.5 Q40 37 43.5 43.5" stroke="#00d68f" strokeWidth="1" fill="none"/>
      </g>
      <circle cx="28" cy="37" r="2.5" fill="#00d68f"/>
    </svg>
  );
}
