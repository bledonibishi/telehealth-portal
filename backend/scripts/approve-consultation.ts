/**
 * Dev only: approves a patient's waiting consultation and issues the prescription, as a doctor would, for testing without
 * going through the clinician portal. It uses the real approval (the same checks, the prescription, its 15-day window, the
 * order and the audit trail), signed by the first active admin clinician. The medicine is the one the patient paid for (from
 * their checkout choices), or the one named on the command line.
 *
 *   cd backend
 *   pnpm approve-consultation patient@example.com --confirm-db <database name>
 *   pnpm approve-consultation patient@example.com --confirm-db <database name> --product oestrogel --strength "0.75 mg per pump"
 *
 * Without --confirm-db it prints the database it would write to and stops: a local address can be a tunnel to a remote one.
 *
 * Uses DATABASE_URL from the environment, or else from backend/.env. Refuses to run in production or against a database that
 * isn't on this machine. Nothing is sent to Stripe, email or the pharmacy partner beyond what a normal approval does, so run it
 * with scratch keys (see CLAUDE.md).
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';

/** Reads KEY=value lines into the environment without overwriting what is set. (process.loadEnvFile needs Node 20.12+.) */
function loadEnv(file: string) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

async function main() {
  const envFile = resolve(__dirname, '../.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) loadEnv(envFile);
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'))?.trim();
  const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  if (!email) {
    console.error('Usage: pnpm approve-consultation <patient email> [--product <slug or brand>] [--strength <label>]');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('Not available in production.');
    process.exit(1);
  }
  const dbUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://unset');
  const host = dbUrl.hostname;
  if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
    console.error(`DATABASE_URL points at "${host}", not this machine. Refusing to approve a consultation there.`);
    process.exit(1);
  }
  // A local address can still be a tunnel to a remote database, so the operator names the database being written to.
  const dbName = decodeURIComponent(dbUrl.pathname.replace(/^\//, ''));
  if (flag('confirm-db') !== dbName) {
    console.error(`This will write to the database "${dbName}" on ${host}:${dbUrl.port || '5432'}. If that is the database you mean, run it again with: --confirm-db ${dbName}`);
    process.exit(1);
  }

  // Loaded after the checks above, so nothing starts against a database this script refused.
  const { AppModule } = await import('../src/app.module');
  const { ConsultationsService } = await import('../src/consultations/consultations.service');
  const { PrismaService } = await import('../src/prisma/prisma.service');
  const { PrescribingService } = await import('../src/prescriptions/prescribing.service');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService, { strict: false });
    const patient = await prisma.patient.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, include: { lead: true } });
    if (!patient) throw new Error(`No patient with the email ${email}.`);
    const consultation = await prisma.consultation.findFirst({
      where: { patientId: patient.id, status: { in: ['SUBMITTED', 'IN_REVIEW', 'MORE_INFO_REQUESTED'] } },
      orderBy: { submittedAt: 'desc' },
    });
    if (!consultation) throw new Error('This patient has no consultation waiting for review.');
    // The first active admin who may prescribe (verified licence, and two-factor sign-in when it is required): the approval checks the same.
    const prescribing = app.get(PrescribingService, { strict: false });
    const admins = await prisma.clinician.findMany({ where: { role: 'ADMIN', deactivatedAt: null, passwordSetAt: { not: null } }, orderBy: { createdAt: 'asc' } });
    let clinician: (typeof admins)[number] | undefined;
    for (const admin of admins) {
      try { await prescribing.assertCanPrescribe(admin.id); clinician = admin; break; } catch { /* not eligible: try the next */ }
    }
    if (!clinician) throw new Error('No active admin clinician is allowed to prescribe (verified licence, and two-factor sign-in when required).');

    const chosen = (patient.lead?.checkoutDetails ?? {}) as { product?: string; dose?: string };
    const wantProduct = (flag('product') ?? chosen.product ?? '').trim();
    const wantStrength = (flag('strength') ?? chosen.dose ?? '').trim();
    if (!wantProduct) throw new Error('The patient has no chosen medicine on record: pass --product (and --strength).');
    const product = await prisma.product.findFirst({
      where: { OR: [{ slug: { equals: wantProduct, mode: 'insensitive' } }, { brandName: { equals: wantProduct, mode: 'insensitive' } }, { name: { equals: wantProduct, mode: 'insensitive' } }] },
      include: { strengths: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!product) throw new Error(`No product matches "${wantProduct}".`);
    // The strength asked for, or the one paid for, or nothing: never another one in its place.
    const strength = wantStrength ? product.strengths.find((s) => s.label.toLowerCase() === wantStrength.toLowerCase()) : product.strengths[0];
    if (!strength) throw new Error(wantStrength ? `${product.name} has no active strength "${wantStrength}".` : `${product.name} has no active strength.`);

    const approved = await app.get(ConsultationsService, { strict: false }).approve(
      clinician.id,
      {
        consultationId: consultation.id,
        items: [{ productId: product.id, strengthId: strength.id, quantity: strength.defaultQuantity ?? 1, directions: product.defaultDirections ?? 'As directed by your doctor.' }],
        notes: 'Issued by the dev script',
        validityDays: 30,
        refillsAllowed: 0,
        overrideReason: 'Dev script: approved for testing',
      },
      true,
    );
    console.log(`Approved ${email}: ${product.brandName ?? product.name} ${strength.label}, consultation ${approved.id}.`);
  } finally {
    await app.close();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
