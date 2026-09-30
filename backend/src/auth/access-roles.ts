import { ClinicianRole } from '../common/enums';

// A patient is identified by 'PATIENT'; staff by their ClinicianRole — the
// Role enum's single 'CLINICIAN' value is too coarse for access control.
export type AccessRole = 'PATIENT' | ClinicianRole;

export const ROLES_KEY = 'allowedRoles';

export const STAFF: AccessRole[] = [
  ClinicianRole.ADMIN,
  ClinicianRole.DOCTOR,
  ClinicianRole.CX_TEAM,
  ClinicianRole.PROVIDER,
];

// Mirrors the clinician portal's nav: Review queue is ADMIN + DOCTOR,
// Orders is ADMIN + PROVIDER, Leads is ADMIN + CX_TEAM.
export const PRESCRIBERS: AccessRole[] = [ClinicianRole.ADMIN, ClinicianRole.DOCTOR];
export const FULFILMENT: AccessRole[] = [ClinicianRole.ADMIN, ClinicianRole.PROVIDER];
export const SALES: AccessRole[] = [ClinicianRole.ADMIN, ClinicianRole.CX_TEAM];

export type AuthUser = { id: string; email: string; role: string; clinicianRole?: ClinicianRole };

export function accessRoleOf(user: Pick<AuthUser, 'role' | 'clinicianRole'> | undefined): AccessRole | null {
  if (!user) return null;
  if (user.role === 'PATIENT') return 'PATIENT';
  if (user.role === 'CLINICIAN' && user.clinicianRole) return user.clinicianRole;
  return null;
}
