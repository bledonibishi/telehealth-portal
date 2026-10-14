/**
 * Dev only: sample support tickets for trying the Tickets screen.
 *
 *   cd backend
 *   pnpm seed-tickets            # replaces earlier samples with fresh ones
 *   pnpm seed-tickets --clear    # removes the samples again
 *
 * Every sample's subject starts with "[Sample]", and nothing else is touched. Links them to existing patients and to
 * the support and doctor accounts when there are any. Uses DATABASE_URL from the environment, or else from
 * backend/.env, and refuses to run against a database that isn't on this machine.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient, TicketPriority, TicketStatus, TicketType } from '@prisma/client';

const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);
const PREFIX = '[Sample] ';

type Sample = {
  subject: string; description: string; type: TicketType; status: TicketStatus; priority: TicketPriority;
  ageHours: number; patient: boolean; assignee?: 'support' | 'doctor'; notes?: string[]; firstReplyAfterHours?: number; resolvedAfterHours?: number;
};

const SAMPLES: Sample[] = [
  { subject: 'App won’t let me upload my body photos', description: 'Tries to upload the side photo, the spinner never finishes. iPhone 13.', type: 'TECHNICAL', status: 'OPEN', priority: 'HIGH', ageHours: 2, patient: true },
  { subject: 'Never received the activation email', description: 'Paid yesterday. Checked spam, nothing there.', type: 'ACCOUNT', status: 'OPEN', priority: 'URGENT', ageHours: 5, patient: true },
  { subject: 'My card was charged twice this month', description: 'Two payments of the same amount on the 3rd.', type: 'BILLING', status: 'IN_PROGRESS', priority: 'HIGH', ageHours: 20, patient: true, assignee: 'support', firstReplyAfterHours: 1, notes: ['Checked Stripe: one payment plus a failed retry that was reversed. Explaining this to the patient.'] },
  { subject: 'Parcel says delivered but I don’t have it', description: 'Tracking shows delivered on Tuesday at 14:10. Nobody was home.', type: 'DELIVERY', status: 'IN_PROGRESS', priority: 'URGENT', ageHours: 30, patient: true, assignee: 'support', firstReplyAfterHours: 2, notes: ['Asked the courier for proof of delivery.', 'Courier says it was left with a neighbour. Patient is checking.'] },
  { subject: 'Feeling dizzy since the second dose', description: 'Dizzy in the mornings for three days. Is that normal?', type: 'CLINICAL', status: 'OPEN', priority: 'URGENT', ageHours: 3, patient: true, assignee: 'doctor', notes: ['Handed to the doctors: side effect question, not for support to answer.'] },
  { subject: 'Can I change my delivery address?', description: 'Moving house next week.', type: 'DELIVERY', status: 'WAITING_ON_PATIENT', priority: 'NORMAL', ageHours: 48, patient: true, assignee: 'support', firstReplyAfterHours: 3, notes: ['Asked for the new address and postcode.'] },
  { subject: 'Question about the monthly price', description: 'Why did my price change after the dose went up?', type: 'BILLING', status: 'WAITING_ON_PATIENT', priority: 'LOW', ageHours: 72, patient: true, assignee: 'support', firstReplyAfterHours: 4, notes: ['Explained the price follows the dose. Waiting for them to confirm.'] },
  { subject: 'Forgot my password and the reset link expired', description: 'Link says it has expired.', type: 'ACCOUNT', status: 'RESOLVED', priority: 'NORMAL', ageHours: 96, patient: true, assignee: 'support', firstReplyAfterHours: 1, resolvedAfterHours: 2, notes: ['Sent a new reset link. Patient signed in.'] },
  { subject: 'The app shows the wrong weight unit', description: 'Wants kilograms, sees pounds.', type: 'TECHNICAL', status: 'RESOLVED', priority: 'LOW', ageHours: 120, patient: true, assignee: 'support', firstReplyAfterHours: 5, resolvedAfterHours: 8, notes: ['Changed in settings with the patient on the phone.'] },
  { subject: 'Doctor asked for new ID photo, how do I send it?', description: 'Got the request but can’t find where to send it.', type: 'CLINICAL', status: 'RESOLVED', priority: 'NORMAL', ageHours: 150, patient: true, assignee: 'doctor', firstReplyAfterHours: 2, resolvedAfterHours: 6, notes: ['Doctor walked the patient through it.'] },
  { subject: 'Partner pharmacy asked about invoice format', description: 'Not about a patient: they want invoices as PDF.', type: 'OTHER', status: 'OPEN', priority: 'LOW', ageHours: 10, patient: false },
  { subject: 'Thank you, all sorted', description: 'Patient confirmed everything works now.', type: 'OTHER', status: 'CLOSED', priority: 'LOW', ageHours: 200, patient: true, assignee: 'support', firstReplyAfterHours: 1, resolvedAfterHours: 3 },
];

async function main() {
  const envFile = resolve(__dirname, '../.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) {
    (process as unknown as { loadEnvFile(path: string): void }).loadEnvFile(envFile);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('Not available in production.');
    process.exit(1);
  }
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname;
  if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
    console.error(`DATABASE_URL points at "${host}", not this machine. Refusing to write samples there.`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const removed = await prisma.ticket.deleteMany({ where: { subject: { startsWith: PREFIX } } });
    if (removed.count) console.log(`Removed ${removed.count} earlier sample ticket(s).`);
    if (process.argv.includes('--clear')) return;

    const [patients, support, doctor, anyStaff] = await Promise.all([
      prisma.patient.findMany({ where: { email: { not: { startsWith: 'demo.' } } }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 8 }),
      prisma.clinician.findFirst({ where: { role: 'CX_TEAM', deactivatedAt: null }, select: { id: true } }),
      prisma.clinician.findFirst({ where: { role: 'DOCTOR', deactivatedAt: null }, select: { id: true } }),
      prisma.clinician.findFirst({ where: { deactivatedAt: null }, select: { id: true } }),
    ]);
    if (!anyStaff) {
      console.error('No staff accounts found. Run the normal seed first.');
      process.exit(1);
    }
    const creator = support ?? anyStaff;

    let i = 0;
    for (const s of SAMPLES) {
      const createdAt = ago(s.ageHours);
      const assigneeId = s.assignee === 'support' ? support?.id : s.assignee === 'doctor' ? doctor?.id : undefined;
      const patientId = s.patient && patients.length ? patients[i++ % patients.length].id : undefined;
      const closed = s.status === 'RESOLVED' || s.status === 'CLOSED';
      await prisma.ticket.create({
        data: {
          subject: PREFIX + s.subject,
          description: s.description,
          type: s.type, status: s.status, priority: s.priority,
          patientId, assigneeId,
          createdById: creator.id,
          createdAt, updatedAt: createdAt,
          firstResponseAt: s.firstReplyAfterHours ? new Date(createdAt.getTime() + s.firstReplyAfterHours * HOUR) : null,
          resolvedAt: closed ? new Date(createdAt.getTime() + (s.resolvedAfterHours ?? 4) * HOUR) : null,
          notes: s.notes ? { create: s.notes.map((body, n) => ({ body, authorId: (s.assignee === 'doctor' ? doctor?.id : support?.id) ?? creator.id, createdAt: new Date(createdAt.getTime() + (n + 1) * HOUR) })) } : undefined,
        },
      });
    }
    console.log(`Added ${SAMPLES.length} sample tickets. Remove them with: pnpm seed-tickets --clear`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
