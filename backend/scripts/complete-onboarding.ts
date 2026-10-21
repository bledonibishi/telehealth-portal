/**
 * Dev only: completes and approves a patient's onboarding, for when the ID check, the photo service and a clinician's review
 * aren't available locally. It writes a placeholder image for each of the ID document, selfie and the front and side body
 * photos, marks each as checked and approved, and sets the onboarding to APPROVED (no prior medication), so the patient can
 * go straight into the portal.
 *
 *   cd backend
 *   pnpm complete-onboarding patient@example.com --confirm-db <database name>
 *
 * Without --confirm-db it prints the database it would write to and stops: a local address can be a tunnel to a remote one.
 *
 * Uses DATABASE_URL (and UPLOAD_DIR) from the environment, or else from backend/.env. Refuses to run against a database that
 * isn't on this machine, and in production.
 */
import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { PrismaClient } from '@prisma/client';

// A valid 1x1 grey PNG. Stored unencrypted, which the uploads service reads as-is.
const PLACEHOLDER = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

type Kind = 'ID_DOCUMENT' | 'SELFIE' | 'BODY_PHOTO_FRONT' | 'BODY_PHOTO_SIDE';

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
    console.error('Usage: pnpm complete-onboarding <patient email> --confirm-db <database name>');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('Not available in production.');
    process.exit(1);
  }
  const dbUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://unset');
  const host = dbUrl.hostname;
  if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
    console.error(`DATABASE_URL points at "${host}", not this machine. Refusing to write placeholder files and approve onboarding there.`);
    process.exit(1);
  }
  // A local address can still be a tunnel to a remote database, so the operator names the database being written to.
  const dbName = decodeURIComponent(dbUrl.pathname.replace(/^\//, ''));
  if (flag('confirm-db') !== dbName) {
    console.error(`This will write to the database "${dbName}" on ${host}:${dbUrl.port || '5432'}. If that is the database you mean, run it again with: --confirm-db ${dbName}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const patient = await prisma.patient.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
    if (!patient) {
      console.error(`No patient with the email ${email}.`);
      process.exit(1);
    }
    const existing = await prisma.onboardingSubmission.findUnique({ where: { patientId: patient.id }, select: { status: true } });
    if (existing?.status === 'APPROVED') {
      console.log('Onboarding is already approved — nothing to do.');
      return;
    }

    const root = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
    const make = async (kind: Kind) => {
      const filename = `dev-${kind.toLowerCase()}.png`;
      const storageKey = `${patient.id}/dev-${Date.now()}-${filename}`;
      await mkdir(dirname(join(root, storageKey)), { recursive: true });
      await writeFile(join(root, storageKey), PLACEHOLDER);
      return prisma.uploadedFile.create({ data: { patientId: patient.id, kind, filename, mimeType: 'image/png', storageKey } });
    };

    const [id, selfie, front, side] = await Promise.all([make('ID_DOCUMENT'), make('SELFIE'), make('BODY_PHOTO_FRONT'), make('BODY_PHOTO_SIDE')]);
    // A passed check for each body photo, so the retake rule doesn't send it back.
    await prisma.bodyPhotoCheck.createMany({
      data: [
        { patientId: patient.id, fileId: front.id, view: 'FRONT' as const, outcome: 'PASS' as const, issues: [], model: 'dev-placeholder' },
        { patientId: patient.id, fileId: side.id, view: 'SIDE' as const, outcome: 'PASS' as const, issues: [], model: 'dev-placeholder' },
      ],
    });

    const now = new Date();
    const data = {
      idDocumentFileId: id.id,
      selfieFileId: selfie.id,
      personaStatus: 'VERIFIED' as const,
      bodyPhotoFrontFileId: front.id,
      bodyPhotoSideFileId: side.id,
      photoReviewStatus: 'APPROVED' as const,
      priorMedicationUse: false,
      status: 'APPROVED' as const,
      identityViaVerifyService: false,
      submittedAt: now,
      reviewedAt: now,
    };
    await prisma.onboardingSubmission.upsert({ where: { patientId: patient.id }, create: { patientId: patient.id, ...data }, update: data });
    console.log(`Onboarding completed and approved for ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
