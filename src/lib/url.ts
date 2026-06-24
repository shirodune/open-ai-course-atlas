// Build an absolute path that respects the configured base path.
// Works for base '/' (served at domain root, e.g. Vercel) and for a
// sub-path base (e.g. GitHub project pages) without producing a double
// slash like "//courses" (which a browser treats as a protocol-relative
// URL pointing at a different host).
const base = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');

export function withBase(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
