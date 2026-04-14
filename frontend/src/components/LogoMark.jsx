export function LogoMark({ size = 32 }) {
  const iconSize = Math.round(size * 1.25);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <img
        src="/logomark.svg"
        alt="SportsCal icon"
        style={{ width: iconSize, height: iconSize, display: 'block' }}
      />
      <span style={{
        fontSize: size * 0.53,
        fontWeight: 600,
        color: 'var(--white)',
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
