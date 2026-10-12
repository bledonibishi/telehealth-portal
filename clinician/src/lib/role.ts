import { getToken } from './auth';

function parseJwt(token: string): Record<string, any> | null {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

export type ClinicianRole = 'ADMIN' | 'DOCTOR' | 'CX_TEAM' | 'PROVIDER';

export function getCurrentRole(): ClinicianRole | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) return null;
  return parseJwt(token)?.role ?? null;
}

/** Who is signed in, read from the token (the server checks it again on every request). */
export function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  return token ? (parseJwt(token)?.sub ?? null) : null;
}

export function hasAccess(allowed: ClinicianRole[]): boolean {
  const role = getCurrentRole();
  return role !== null && allowed.includes(role);
}

// Where each role lands after login — must be a page it actually has access
// to (see NAV in the portal layout).
const LANDING_PATH: Record<ClinicianRole, string> = {
  ADMIN: '/',
  DOCTOR: '/queue',
  CX_TEAM: '/leads',
  PROVIDER: '/orders',
};

export function landingPathFor(role: ClinicianRole | null): string {
  return role ? LANDING_PATH[role] : '/login';
}
