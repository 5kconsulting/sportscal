import { useId } from 'react';

// Inline SVG of the official SportsCal mark (mirrors public/favicon.svg).
// Rendered inline — rather than <img src="/favicon-192.png"> — so the accent
// color flows from design tokens: identical green-on-navy in the classic skin,
// and blue-on-navy under the beta skin, with no second asset to maintain.
// Shapes, proportions, and the navy ground are unchanged from the brand art.
export function LogoMark({ size = 32, dark = false }) {
  const clip = useId();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width={size} height={size} viewBox="0 0 256 256"
           role="img" aria-label="SportsCal icon" style={{ display: 'block' }}>
        <defs>
          <clipPath id={clip}>
            <circle cx="190" cy="198" r="38" />
          </clipPath>
        </defs>
        <rect width="256" height="256" rx="52" fill="var(--navy)" />
        <rect x="44" y="68" width="168" height="140" rx="16" fill="none" stroke="var(--accent)" strokeWidth="12" />
        <rect x="44" y="68" width="168" height="52" rx="16" fill="var(--accent)" />
        <rect x="44" y="96" width="168" height="24" fill="var(--accent)" />
        <rect x="88" y="40" width="16" height="44" rx="8" fill="var(--accent-dim)" />
        <rect x="152" y="40" width="16" height="44" rx="8" fill="var(--accent-dim)" />
        <text x="128" y="112" textAnchor="middle" fontFamily="'DM Sans', Arial, sans-serif"
              fontWeight="800" fontSize="30" fill="var(--on-accent)">12</text>
        <circle cx="88" cy="154" r="7" fill="var(--accent)" opacity="0.5" />
        <circle cx="128" cy="154" r="7" fill="var(--accent)" opacity="0.5" />
        <circle cx="168" cy="154" r="7" fill="var(--accent)" opacity="0.5" />
        <circle cx="88" cy="186" r="7" fill="var(--accent)" opacity="0.3" />
        <circle cx="128" cy="186" r="7" fill="var(--accent)" opacity="0.3" />
        <circle cx="168" cy="186" r="7" fill="var(--accent)" opacity="0.15" />
        <circle cx="190" cy="198" r="44" fill="var(--navy)" />
        <circle cx="190" cy="198" r="38" fill="var(--navy)" stroke="var(--accent)" strokeWidth="5" />
        <g clipPath={`url(#${clip})`}>
          <line x1="152" y1="198" x2="228" y2="198" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
          <line x1="190" y1="160" x2="190" y2="236" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
          <path d="M 167 160 Q 183 198 167 236" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
          <path d="M 213 160 Q 197 198 213 236" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
        </g>
        <circle cx="190" cy="198" r="38" fill="none" stroke="var(--accent)" strokeWidth="5" />
      </svg>
      <span style={{
        fontSize: size * 0.53,
        fontWeight: 600,
        color: dark ? 'var(--navy)' : 'var(--white)',
        letterSpacing: '-0.02em',
        lineHeight: 1,
        fontFamily: "'DM Sans', sans-serif",
        marginTop: 3,
      }}>
        SportsCal
      </span>
    </div>
  );
}
