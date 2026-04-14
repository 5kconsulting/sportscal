export function LogoMark({ size = 32 }) {
  const iconSize = Math.round(size * 1.25);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
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
        marginBottom: Math.round(size * 0.09),
      }}>
        SportsCal
      </span>
    </div>
  );
}
