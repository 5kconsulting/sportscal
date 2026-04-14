export function LogoMark({ size = 32 }) {
  // Logo is landscape — use a fixed width that fits the sidebar (240px - 48px padding = 192px usable)
  // For login/signup pages where size is 40, scale proportionally
  const width = Math.round((size / 32) * 160);
  return (
    <img
      src="/logo.png"
      alt="SportsCal"
      style={{ width, height: 'auto', display: 'block' }}
    />
  );
}
