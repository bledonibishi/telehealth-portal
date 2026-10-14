export type TicketType = 'TECHNICAL' | 'BILLING' | 'DELIVERY' | 'ACCOUNT' | 'CLINICAL' | 'OTHER';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_PATIENT' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type Ticket = {
  id: string; number: number; type: TicketType; status: TicketStatus; priority: TicketPriority; subject: string;
  description: string | null; patientId: string | null; patientName: string | null; assigneeId: string | null; assigneeName: string | null;
  createdAt: string; updatedAt: string; firstResponseAt: string | null; replyDueAt: string | null; resolvedAt: string | null;
  engineeringSentAt: string | null; engineeringSentByName: string | null; engineeringNote: string | null; engineeringDoneAt: string | null;
  notes: { id: string; authorName: string; body: string; createdAt: string }[];
  attachments: { id: string; filename: string; mimeType: string; createdAt: string }[];
};

// English labels, shown through t().
export const TYPE_LABEL: Record<TicketType, string> = {
  TECHNICAL: 'Technical', BILLING: 'Billing', DELIVERY: 'Delivery', ACCOUNT: 'Account', CLINICAL: 'For the doctor', OTHER: 'Other',
};
export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_ON_PATIENT: 'Waiting on patient', RESOLVED: 'Resolved', CLOSED: 'Closed',
};
export const PRIORITY_LABEL: Record<TicketPriority, string> = { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High', URGENT: 'Urgent' };

export const STATUS_CLS: Record<TicketStatus, string> = {
  OPEN: 'bg-amber-50 text-amber-700',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  WAITING_ON_PATIENT: 'bg-gray-100 text-gray-600',
  RESOLVED: 'bg-green-50 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-500',
};
export const PRIORITY_CLS: Record<TicketPriority, string> = {
  LOW: 'text-gray-400', NORMAL: 'text-gray-500', HIGH: 'text-amber-600 font-medium', URGENT: 'text-danger-500 font-semibold',
};
export const TYPE_CLS: Record<TicketType, string> = {
  TECHNICAL: 'bg-sky-50 text-sky-700', BILLING: 'bg-emerald-50 text-emerald-700', DELIVERY: 'bg-orange-50 text-orange-700',
  ACCOUNT: 'bg-indigo-50 text-indigo-700', CLINICAL: 'bg-purple-50 text-purple-700', OTHER: 'bg-gray-100 text-gray-600',
};

export const isClosed = (s: TicketStatus) => s === 'RESOLVED' || s === 'CLOSED';

/** How a first reply stands: answered, still due, or late. `hours` is how far from the deadline (negative when late). */
export function replyState(t: { firstResponseAt: string | null; replyDueAt: string | null }, now = Date.now()): { kind: 'replied' | 'due' | 'late' | 'none'; hours: number } {
  if (t.firstResponseAt) return { kind: 'replied', hours: 0 };
  if (!t.replyDueAt) return { kind: 'none', hours: 0 };
  const hours = (new Date(t.replyDueAt).getTime() - now) / 3_600_000;
  return { kind: hours < 0 ? 'late' : 'due', hours };
}

/** "3 h" or "40 min": a length of time, short. */
export const shortHours = (hours: number) => {
  const h = Math.abs(hours);
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
};

/** Passed to the engineers and not yet marked done. */
export const withEngineering = (t: { engineeringSentAt: string | null; engineeringDoneAt: string | null }) => !!t.engineeringSentAt && !t.engineeringDoneAt;
