/**
 * Shared date & CSV utility functions.
 * Import from here instead of redefining per-page.
 */

/** Format ISO date → medium locale date string, e.g. "12 Jun 2026" */
export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' });
}

/** Format ISO datetime → medium date + short time, e.g. "12 Jun 2026, 09:30" */
export function fmtDateTime(ts) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Format ISO date → locale date+time in en-IN, e.g. "12 Jun 2026, 09:30 AM" */
export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Returns YYYY-MM-01 for the current month */
export function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Returns the first day of the month from a YYYY-MM-DD string */
export function startOfMonth(dateStr) {
  return dateStr.slice(0, 7) + '-01';
}

/** Returns the Monday of the ISO week for a given YYYY-MM-DD (UTC) */
export function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

/** Shift a YYYY-MM-DD string by `days` (UTC-safe) */
export function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Escape a value for CSV output */
export function escCsv(v) {
  const s = String(v ?? '');
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** SVG cubic-bezier smooth path from array of [x, y] points */
export function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}
