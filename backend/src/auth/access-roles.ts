import { ClinicianRole } from '../common/enums';

// A patient is identified by 'PATIENT'; staff by their ClinicianRole — the
// Role enum's single 'CLINICIAN' value is too coarse for access control.
export type AccessRole = 'PATIENT' | ClinicianRole;

export const ROLES_KEY = 'allowedRoles';

// Everyone who may see patient records: clinical and support staff. The pharmacy partner (PROVIDER) is deliberately
// not here: it sees the orders it has to fulfil (see FULFILMENT) and nothing else about a patient.
export const CLINICAL_STAFF: AccessRole[] = [ClinicianRole.ADMIN, ClinicianRole.DOCTOR, ClinicianRole.CX_TEAM];

// Every signed-in staff account, including the pharmacy partner. Use it only for things that hold no patient data
// (an account's own security settings, counts, the product catalogue, a prescription to dispense).
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
// Who decides how a parcel travels: enters the courier and tracking, says it has shipped, and says by hand that it is
// out for delivery or has arrived. Not the pharmacy: it supplies the medicine and packs it, and nothing more. Delivery
// is ours, and what happens after the hand-over comes from the courier (see couriers/), or from us when a courier has
// no integration.
export const DELIVERY_CONFIRMERS: AccessRole[] = [ClinicianRole.ADMIN];
export const SALES: AccessRole[] = [ClinicianRole.ADMIN, ClinicianRole.CX_TEAM];

export type AuthUser = { id: string; email: string; role: string; clinicianRole?: ClinicianRole };

export function accessRoleOf(user: Pick<AuthUser, 'role' | 'clinicianRole'> | undefined): AccessRole | null {
  if (!user) return null;
  if (user.role === 'PATIENT') return 'PATIENT';
  if (user.role === 'CLINICIAN' && user.clinicianRole) return user.clinicianRole;
  return null;
}
