// The backend's session token lasts 12 hours. POST /mobile/auth/refresh swaps a token that is still valid for a new
// one and revokes the old one at once. An expired token cannot be refreshed, so the app renews it early, while the
// driver is online and the token still works.

/** Renew when this much (or less) of the token's life is left. */
export const REFRESH_WINDOW_MS = 2 * 60 * 60 * 1000;

export function shouldRefresh(expiresAt: string, now: number): boolean {
  const remaining = new Date(expiresAt).getTime() - now;
  return Number.isFinite(remaining) && remaining > 0 && remaining <= REFRESH_WINDOW_MS;
}

/**
 * A 401 only ends the session when it belongs to the token the app holds now. A request sent with the old token a
 * moment before a refresh also comes back 401 (that token was revoked); it must not sign the driver out.
 */
export function endsSession(usedToken: string | null | undefined, currentToken: string | null): boolean {
  return !usedToken || usedToken === currentToken;
}
