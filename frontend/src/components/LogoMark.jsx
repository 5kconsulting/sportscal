export function LogoMark({ size = 32 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <img
        src="/favicon.svg"
        alt="SportsCal icon"
        style={{ width: size, height: size, display: 'block', borderRadius: Math.round(size * 0.2) }}
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
