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

export function hasAccess(allowed: ClinicianRole[]): boolean {
  const role = getCurrentRole();
  return role !== null && allowed.includes(role);
}
