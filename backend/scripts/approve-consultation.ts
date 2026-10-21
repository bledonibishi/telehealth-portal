/**
 * Dev only: approves a patient's waiting consultation and issues the prescription, as a doctor would, for testing without
 * going through the clinician portal. It uses the real approval (the same checks, the prescription, its 15-day window, the
 * order and the audit trail), signed by the first active admin clinician. The medicine is the one the patient paid for (from
 * their checkout choices), or the one named on the command line.
 *
 *   cd backend
 *   pnpm approve-consultation patient@example.com
 *   pnpm approve-consultation patient@example.com --product oestrogel --strength "0.75 mg per pump"
 *
 * Uses DATABASE_URL from the environment, or else from backend/.env. Refuses to run in production or against a database that
 * isn't on this machine. Nothing is sent to Stripe, email or the pharmacy partner beyond what a normal approval does, so run it
 * with scratch keys (see CLAUDE.md).
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';

async function main() {
  const envFile = resolve(__dirname, '../.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) {
    (process as unknown as { loadEnvFile(path: string): void }).loadEnvFile(envFile);
  }
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
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname;
  if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
    console.error(`DATABASE_URL points at "${host}", not this machine. Refusing to approve a consultation there.`);
    process.exit(1);
  }

  // Loaded after the checks above, so nothing starts against a database this script refused.
  const { AppModule } = await import('../src/app.module');
  const { ConsultationsService } = await import('../src/consultations/consultations.service');
  const { PrismaService } = await import('../src/prisma/prisma.service');
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
    const clinician = await prisma.clinician.findFirst({ where: { role: 'ADMIN', deactivatedAt: null, passwordSetAt: { not: null } } });
    if (!clinician) throw new Error('No active admin clinician to sign it.');

    const chosen = (patient.lead?.checkoutDetails ?? {}) as { product?: string; dose?: string };
    const wantProduct = (flag('product') ?? chosen.product ?? '').trim();
    const wantStrength = (flag('strength') ?? chosen.dose ?? '').trim();
    if (!wantProduct) throw new Error('The patient has no chosen medicine on record: pass --product (and --strength).');
    const product = await prisma.product.findFirst({
      where: { OR: [{ slug: { equals: wantProduct, mode: 'insensitive' } }, { brandName: { equals: wantProduct, mode: 'insensitive' } }, { name: { equals: wantProduct, mode: 'insensitive' } }] },
      include: { strengths: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!product) throw new Error(`No product matches "${wantProduct}".`);
    const strength = product.strengths.find((s) => !wantStrength || s.label.toLowerCase() === wantStrength.toLowerCase()) ?? product.strengths[0];
    if (!strength) throw new Error(`${product.name} has no active strength.`);

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
