export const ROLES = ['ADMIN', 'DOCTOR', 'CX_TEAM', 'PROVIDER'] as const;
export type Role = (typeof ROLES)[number];

/** What each role is called, what it opens, and the colours used for its badge and the avatar behind a person's initials. */
export const ROLE_META: Record<string, { label: string; description: string; badge: string; avatar: string }> = {
  ADMIN:    { label: 'Admin',    description: 'Full access to all features',      badge: 'bg-purple-100 text-purple-700', avatar: 'bg-purple-100 text-purple-700' },
  DOCTOR:   { label: 'Doctor',   description: 'Patients, review queue',           badge: 'bg-blue-100 text-blue-700',     avatar: 'bg-blue-100 text-blue-700' },
  CX_TEAM:  { label: 'CX Team',  description: 'Leads, patients, messaging',       badge: 'bg-teal-100 text-teal-700',     avatar: 'bg-teal-100 text-teal-700' },
  PROVIDER: { label: 'Provider', description: 'Orders only (pharmacy partner)',   badge: 'bg-amber-100 text-amber-700',   avatar: 'bg-amber-100 text-amber-700' },
};

/** Only these roles can prescribe, so only they need a checked licence. */
export const PRESCRIBING_ROLES: string[] = ['ADMIN', 'DOCTOR'];
