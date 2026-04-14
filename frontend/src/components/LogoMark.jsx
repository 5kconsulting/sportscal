export function LogoMark({ size = 32 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img
        src="/logomark.svg"
        alt="SportsCal icon"
        style={{ width: size, height: size, display: 'block' }}
      />
      <span style={{
        fontSize: size * 0.53,
        fontWeight: 600,
        color: 'var(--white)',
        letterSpacing: '-0.02em',
        lineHeight: 1,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        SportsCal
      </span>
    </div>
  );
}
