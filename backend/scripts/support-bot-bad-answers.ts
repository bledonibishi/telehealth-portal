/**
 * Lists the answers from the automated assistant that the team rated bad (Assistant → How it's doing), with the conversation
 * that led to each and a draft test case, so each mistake can become a question in src/support-bot/eval-cases.ts.
 *
 *   cd backend
 *   pnpm support-bot-bad-answers          # the last 30 days
 *   pnpm support-bot-bad-answers 90       # the last 90 days
 *
 * It only reads, and writes nothing to disk. What it prints are real patients' messages: read them here, then write the test
 * case in your own words with nothing that could identify the patient. Never paste them into the repository, a ticket or a
 * chat. Uses DATABASE_URL from the environment, or else from backend/.env.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

async function main() {
  const envFile = resolve(__dirname, '../.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) (process as unknown as { loadEnvFile(path: string): void }).loadEnvFile(envFile);
  const days = Number(process.argv[2] ?? 30);
  if (!Number.isInteger(days) || days < 1) throw new Error('Give the number of days as a whole number, e.g. 30');
  const prisma = new PrismaClient();
  try {
    const since = new Date(Date.now() - days * 86_400_000);
    const bad = await prisma.message.findMany({
      where: { isAi: true, aiFeedback: 'BAD', sentAt: { gte: since } },
      orderBy: { sentAt: 'desc' },
      take: 50,
      select: { id: true, patientId: true, consultationId: true, sentAt: true, content: true, aiArticleId: true, aiFeedbackNote: true },
    });
    if (!bad.length) {
      console.log(`No answers rated bad in the last ${days} days.`);
      return;
    }
    console.log(`${bad.length} answer(s) rated bad in the last ${days} days.`);
    console.log('What follows are REAL patients’ messages. Write each test case in your own words; never copy them into the repository.\n');

    for (const [i, m] of bad.entries()) {
      const before = (await prisma.message.findMany({
        where: { patientId: m.patientId, consultationId: m.consultationId, sentAt: { lt: m.sentAt } },
        orderBy: { sentAt: 'desc' },
        take: 6,
        select: { senderRole: true, isAi: true, content: true },
      })).reverse();
      console.log(`── ${i + 1} of ${bad.length} · ${m.sentAt.toISOString().slice(0, 10)} · from the article ${m.aiArticleId ?? '(none)'}`);
      console.log(`Rated bad${m.aiFeedbackNote ? `: “${m.aiFeedbackNote}”` : ' (no note)'}`);
      for (const b of before) console.log(`  ${b.senderRole === 'PATIENT' ? 'Patient' : b.isAi ? 'Assistant' : 'Team'}: ${b.content.slice(0, 300).replace(/\n/g, ' ')}`);
      console.log(`  Assistant (the bad answer): ${m.content.slice(0, 400).replace(/\n/g, ' ')}`);
      console.log('Draft case: rewrite the transcript, then say what the assistant should have done:');
      console.log(`  { name: 'TODO: what went wrong', transcript: patient('TODO: the question, in your own words'), expect: { intent: ['SUPPORT_QUESTION'], article: ${m.aiArticleId ? `'${m.aiArticleId}'` : 'null'} /* TODO: the right article, or null to hand it to a person */ } },\n`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
