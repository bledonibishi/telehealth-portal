/**
 * Dev only: gives one patient example lab results, to see the Labs tab, the trend charts and the check-in lab panel with
 * real-looking data. The results fit the patient's programme (HRT, testosterone or weight management).
 *
 *   cd backend
 *   pnpm seed-labs someone@example.com          # replaces earlier example results for that patient, then adds fresh ones
 *   pnpm seed-labs someone@example.com --clear  # removes the example results again
 *
 * The results it adds have ids starting "example-lab-"; nothing else about the patient is touched. Uses DATABASE_URL from
 * the environment, or else from backend/.env, and refuses to run against a database that isn't on this machine.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import { Prisma, PrismaClient } from '@prisma/client';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

type Point = { kind: string; name?: string; unit: string; low: number | null; high: number | null; values: Array<[daysAgo: number, value: number]> };

// What a person on each programme would plausibly have tested, with the lab's usual reference range.
const SETS: Record<string, Point[]> = {
  HRT: [
    { kind: 'ESTRADIOL', unit: 'pmol/L', low: 100, high: 700, values: [[270, 62], [180, 215], [95, 340], [30, 455], [6, 780]] },
    { kind: 'FSH', unit: 'IU/L', low: 25.8, high: 134.8, values: [[270, 91], [95, 58], [6, 44]] },
    { kind: 'SHBG', unit: 'nmol/L', low: 18, high: 144, values: [[270, 52], [6, 61]] },
    { kind: 'OTHER', name: 'Vitamin D', unit: 'nmol/L', low: 50, high: 125, values: [[180, 38], [30, 64]] },
  ],
  TRT: [
    { kind: 'TESTOSTERONE', unit: 'nmol/L', low: 8.6, high: 29, values: [[300, 7.2], [210, 14.8], [120, 21.5], [30, 27.9]] },
    { kind: 'HEMATOCRIT', unit: '%', low: 40, high: 54, values: [[300, 44], [210, 47], [120, 50], [30, 55]] },
    { kind: 'PSA', unit: 'ng/mL', low: 0, high: 4, values: [[300, 0.8], [120, 1.0], [30, 1.1]] },
  ],
  GLP1: [
    { kind: 'HBA1C', unit: 'mmol/mol', low: 20, high: 42, values: [[200, 47], [100, 41], [20, 37]] },
    { kind: 'LIVER_FUNCTION', unit: 'U/L', low: 7, high: 56, values: [[200, 68], [20, 52]] },
    { kind: 'LIPID_PANEL', unit: 'mmol/L', low: 0, high: 5, values: [[200, 5.9], [20, 4.7]] },
  ],
};

async function main() {
  const email = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!email) {
    console.error('Usage: pnpm seed-labs <patient email> [--clear]');
    process.exit(1);
  }
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
    console.error(`DATABASE_URL points at "${host}", not this machine. Refusing to write examples there.`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const patient = await prisma.patient.findFirst({ where: { email: { equals: email.trim(), mode: 'insensitive' } }, include: { lead: true, prescriptions: { include: { items: { include: { product: true } } }, orderBy: { issuedAt: 'desc' }, take: 1 } } });
    if (!patient) {
      console.error(`No patient with the email ${email}.`);
      process.exit(1);
    }
    const prefix = `example-lab-${patient.id}-`;
    const removed = await prisma.labResult.deleteMany({ where: { id: { startsWith: prefix } } });
    if (removed.count) console.log(`Removed ${removed.count} earlier example result(s).`);
    if (process.argv.includes('--clear')) return;

    const kind = (patient.prescriptions[0]?.items[0]?.product.kind ?? patient.lead?.productKind ?? 'HRT') as string;
    const set = SETS[kind] ?? SETS.HRT;
    const doctor = await prisma.clinician.findUnique({ where: { email: 'doctor@clinic.dev' } });
    if (!doctor) {
      console.error('doctor@clinic.dev is missing. Run the normal seed first: pnpm prisma:seed');
      process.exit(1);
    }

    let n = 0;
    const rows: Prisma.LabResultUncheckedCreateInput[] = [];
    const lastIndex = (p: Point) => p.values.length - 1;
    for (const p of set) {
      p.values.forEach(([ago, value], i) => {
        const flagged = (p.low != null && value < p.low) || (p.high != null && value > p.high);
        // The newest out-of-range result is left for a doctor to review (the red strip on the tab); older ones were reviewed.
        const review = flagged && i < lastIndex(p);
        rows.push({
          id: `${prefix}${++n}`, patientId: patient.id, kind: p.kind as any, analyteName: p.name ?? null, value, unit: p.unit,
          referenceRangeLow: p.low, referenceRangeHigh: p.high, flagged, collectedAt: daysAgo(ago), enteredById: doctor.id,
          ...(review ? { reviewedAt: daysAgo(ago - 1), reviewedById: doctor.id, reviewNote: 'Noted and discussed with the patient.' } : {}),
        });
      });
    }
    await prisma.labResult.createMany({ data: rows });
    console.log(`Added ${rows.length} example results for ${patient.firstName} ${patient.lastName} (${kind}):`);
    for (const p of set) console.log(`  ${(p.name ?? p.kind).padEnd(14)} ${p.values.length} results over ${Math.max(...p.values.map(([d]) => d))} days`);
    console.log('\nOpen the patient → Labs. To remove them again: pnpm seed-labs ' + email + ' --clear');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
