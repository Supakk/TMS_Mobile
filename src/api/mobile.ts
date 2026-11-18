import { request } from './client';

// Shapes follow MobileContracts.cs in the backend. Dates are ISO strings in UTC.

export type TenantView = { tenantId: string; companyCode: string; displayName: string };

export type AccountView = {
  id: string;
  driverCode: string;
  email: string;
  displayName: string;
  active: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  version: string;
};

export type LoginView = { accessToken: string; expiresAt: string; account: AccountView };

export async function resolveTenant(companyCode: string): Promise<TenantView> {
  const { data } = await request<TenantView>(`/mobile/tenants/resolve/${encodeURIComponent(companyCode.trim())}`);
  return data;
}

export async function login(tenantId: string, email: string, password: string): Promise<LoginView> {
  const { data } = await request<LoginView>('/mobile/auth/login', {
    method: 'POST',
    body: { tenantId, email: email.trim(), password },
  });
  return data;
}

/** Swaps a token that is still valid for a new one; the old one is revoked at once. */
export async function refresh(token: string): Promise<LoginView> {
  const { data } = await request<LoginView>('/mobile/auth/refresh', { method: 'POST', token });
  return data;
}

export async function logout(token: string): Promise<void> {
  await request<void>('/mobile/auth/logout', { method: 'POST', token });
}
