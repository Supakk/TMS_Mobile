import { endsSession, REFRESH_WINDOW_MS, shouldRefresh } from '../src/auth/refresh';

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe('when to renew the token', () => {
  it('does not renew a token with plenty of life left', () => {
    expect(shouldRefresh(at(10 * 60 * 60 * 1000), NOW)).toBe(false);
    expect(shouldRefresh(at(REFRESH_WINDOW_MS + 1), NOW)).toBe(false);
  });

  it('renews inside the two-hour window', () => {
    expect(shouldRefresh(at(REFRESH_WINDOW_MS), NOW)).toBe(true);
    expect(shouldRefresh(at(60_000), NOW)).toBe(true);
  });

  it('does not try to renew a token that has already expired (the server would refuse it)', () => {
    expect(shouldRefresh(at(0), NOW)).toBe(false);
    expect(shouldRefresh(at(-1000), NOW)).toBe(false);
  });

  it('ignores a date it cannot read', () => {
    expect(shouldRefresh('not a date', NOW)).toBe(false);
  });
});

describe('which 401 ends the session', () => {
  it('ends it when the failed request used the token the app holds', () => {
    expect(endsSession('new-token', 'new-token')).toBe(true);
  });

  it('does not end it for a request sent with a token that was just replaced', () => {
    expect(endsSession('old-token', 'new-token')).toBe(false);
  });

  it('ends it when the app holds no token any more, or the request carried none', () => {
    expect(endsSession('old-token', null)).toBe(false);
    expect(endsSession(undefined, 'new-token')).toBe(true);
  });
});
