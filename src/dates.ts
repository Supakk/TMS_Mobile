// One formatter for every date on screen. The era is always passed in: the API carries
// Christian-era ISO strings in UTC, and we show them in the device's time zone.

export type Era = 'BE' | 'CE';

const pad = (value: number) => String(value).padStart(2, '0');

function parts(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatDate(iso: string | null | undefined, era: Era): string {
  const date = iso ? parts(iso) : null;
  if (!date) return '-';
  const year = date.getFullYear() + (era === 'BE' ? 543 : 0);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${year}`;
}

export function formatTime(iso: string | null | undefined): string {
  const date = iso ? parts(iso) : null;
  if (!date) return '-';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateTime(iso: string | null | undefined, era: Era): string {
  if (!iso || !parts(iso)) return '-';
  return `${formatDate(iso, era)} ${formatTime(iso)}`;
}

/** "20/11/2026" for one day, "20/11/2026 - 21/11/2026" when the end is another day. */
export function formatDateRange(from: string | null | undefined, to: string | null | undefined, era: Era): string {
  const a = formatDate(from, era);
  const b = formatDate(to, era);
  if (b === '-' || a === b) return a;
  if (a === '-') return b;
  return `${a} - ${b}`;
}
