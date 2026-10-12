/**
 * Dev only: runs the "finish your order" reminder pass once, on the example leads (demo.*@example.com) only, and says
 * what it did with each. Nothing is emailed: the email is replaced here by a stub that prints what would have been sent,
 * so a real email key in backend/.env is never used.
 *
 *   cd backend
 *   pnpm lead-reminders-now
 *
 * A reminder "sent" here counts on the lead (the Leads page shows "1 sent"), so run `pnpm seed-examples` to start over.
 * To try the stop link, open the "stop" address it prints.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { LeadRemindersService, FIRST_REMINDER_AFTER_MS, MAX_REMINDERS, SECOND_REMINDER_AFTER_MS, STOP_AFTER_MS } from '../src/leads/lead-reminders.service';
import { triageEligibility } from '../src/questionnaires/triage';

const DAY = 86_400_000;

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
    console.error(`DATABASE_URL points at "${host}", not this machine. Refusing to run.`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const env: Record<string, string | undefined> = {
    ...process.env,
    LEAD_REMINDERS_ENABLED: 'true',
    API_PUBLIC_URL: process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`,
  };
  const sent: Array<{ to: string; last: boolean; continueUrl: string; stopUrl: string }> = [];
  const email = {
    sendLeadReminderEmail: async (to: string, _name: string, continueUrl: string, stopUrl: string, last: boolean) => {
      sent.push({ to, last, continueUrl, stopUrl });
      return true;
    },
  };
  const service = new LeadRemindersService(prisma as any, email as any, { get: (k: string) => env[k] } as any);

  try {
    const now = new Date();
    const before = await prisma.lead.findMany({ where: { email: { startsWith: 'demo.' } }, include: { patient: { select: { id: true } } }, orderBy: { email: 'asc' } });
    await service.sendDue(now, 'demo.');

    console.log('\nWhat the reminder pass did with each example lead:\n');
    for (const l of before) {
      const idle = now.getTime() - l.updatedAt.getTime();
      const mail = sent.find((s) => s.to === l.email);
      let verdict: string;
      if (mail) verdict = `REMINDED${mail.last ? ' (the last one)' : ''}`;
      else if (l.remindersStoppedAt) verdict = 'skipped: asked to stop the reminders';
      else if (l.convertedAt || l.patient) verdict = 'skipped: already paid / has an account';
      else if (!l.intakeSavedAt) verdict = 'skipped: never got as far as the plans (no health answers)';
      else if (triageEligibility(l.productKind as any, l.quizAnswers as any).riskTag === 'RED') verdict = 'skipped: the eligibility check ruled them out';
      else if (l.reminderCount >= MAX_REMINDERS) verdict = 'skipped: already had the maximum reminders';
      else if (idle > STOP_AFTER_MS) verdict = `skipped: no activity for over ${STOP_AFTER_MS / DAY} days`;
      else if (idle < FIRST_REMINDER_AFTER_MS) verdict = 'skipped: active within the last day';
      else if (l.reminderCount > 0) verdict = `skipped: next reminder not due for ${Math.max(1, Math.ceil((SECOND_REMINDER_AFTER_MS - (now.getTime() - (l.lastReminderAt?.getTime() ?? 0))) / DAY))} more day(s)`;
      else verdict = 'skipped';
      console.log(`  ${l.email.padEnd(32)} ${verdict}`);
    }
    for (const m of sent) {
      console.log(`\nWould have emailed ${m.to}${m.last ? ' (last reminder)' : ''}:`);
      console.log(`  Continue: ${m.continueUrl}`);
      console.log(`  Stop:     ${m.stopUrl}`);
    }
    if (sent.length === 0) console.log('\nNothing was due. Run `pnpm seed-examples` to reset the examples.');
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
