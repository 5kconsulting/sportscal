export function LogoMark({ size = 32 }) {
  return (
    <img
      src="/logomark.svg"
      alt="SportsCal"
      style={{ width: size, height: size, display: 'block', borderRadius: 6 }}
    />
  );
}
