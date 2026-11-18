import { formatDate, formatDateTime, formatTime } from '../src/dates';

// Local-time constructor so the test does not depend on the machine's time zone.
const iso = new Date(2026, 10, 18, 9, 5).toISOString();

describe('dates', () => {
  it('shows the Christian era', () => {
    expect(formatDate(iso, 'CE')).toBe('18/11/2026');
  });

  it('shows the Buddhist era (+543)', () => {
    expect(formatDate(iso, 'BE')).toBe('18/11/2569');
  });

  it('formats time and date-time', () => {
    expect(formatTime(iso)).toBe('09:05');
    expect(formatDateTime(iso, 'BE')).toBe('18/11/2569 09:05');
  });

  it('returns a dash for missing or invalid values', () => {
    expect(formatDate(null, 'CE')).toBe('-');
    expect(formatTime('nonsense')).toBe('-');
    expect(formatDateTime(undefined, 'BE')).toBe('-');
  });
});
