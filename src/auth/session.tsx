import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setUnauthorizedHandler } from '../api/client';
import { logout as apiLogout, type AccountView, type TenantView } from '../api/mobile';

// Tokens go to secure storage, never to SQLite (AGENT_CONTEXT, offline rule 7).
const KEY_TENANT = 'tms.tenant';
const KEY_SESSION = 'tms.session';

type StoredSession = { token: string; expiresAt: string; account: AccountView };

type SessionState = {
  /** false until the stored values have been read. */
  ready: boolean;
  tenant: TenantView | null;
  session: StoredSession | null;
  saveTenant: (tenant: TenantView) => Promise<void>;
  signIn: (session: StoredSession) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [tenant, setTenant] = useState<TenantView | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    (async () => {
      const [storedTenant, storedSession] = await Promise.all([
        readJson<TenantView>(KEY_TENANT),
        readJson<StoredSession>(KEY_SESSION),
      ]);
      setTenant(storedTenant);
      // The token is opaque with an expiry. An expired one is dropped, not refreshed here.
      setSession(storedSession && new Date(storedSession.expiresAt) > new Date() ? storedSession : null);
      setReady(true);
    })();
  }, []);

  const saveTenant = useCallback(async (value: TenantView) => {
    await SecureStore.setItemAsync(KEY_TENANT, JSON.stringify(value));
    setTenant(value);
  }, []);

  const signIn = useCallback(async (value: StoredSession) => {
    await SecureStore.setItemAsync(KEY_SESSION, JSON.stringify(value));
    setSession(value);
  }, []);

  const clearSession = useCallback(async () => {
    await SecureStore.deleteItemAsync(KEY_SESSION);
    setSession(null);
  }, []);

  const signOut = useCallback(async () => {
    const token = session?.token;
    // Tell the server on a best-effort basis; the local session goes either way.
    if (token) await apiLogout(token).catch(() => undefined);
    await clearSession();
  }, [session, clearSession]);

  // On any 401 the session is cleared and the router sends the driver to sign in.
  useEffect(() => {
    setUnauthorizedHandler(() => void clearSession());
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const value = useMemo(
    () => ({ ready, tenant, session, saveTenant, signIn, signOut }),
    [ready, tenant, session, saveTenant, signIn, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
