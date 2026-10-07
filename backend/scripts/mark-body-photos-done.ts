/**
 * Dev only: marks a patient's front and side body photos as uploaded, checked and approved, for when the
 * photo service isn't available locally. It writes a placeholder image for each view, so the portal and the
 * clinician's review screen show the step as done and onboarding can be submitted.
 *
 *   cd backend
 *   pnpm mark-body-photos-done patient@example.com
 *
 * Uses DATABASE_URL (and UPLOAD_DIR) from the environment, or else from backend/.env. Refuses to run
 * against a database that isn't on this machine.
 */
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { PrismaClient } from '@prisma/client';

// A valid 1x1 grey PNG. Stored unencrypted, which the uploads service reads as-is.
const PLACEHOLDER = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function main() {
  const envFile = resolve(__dirname, '../.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) {
    (process as unknown as { loadEnvFile(path: string): void }).loadEnvFile(envFile);
  }
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error('Usage: pnpm mark-body-photos-done <patient email>');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('Not available in production.');
    process.exit(1);
  }
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname;
  if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
    console.error(`DATABASE_URL points at "${host}", not this machine. Refusing to write placeholder photos there.`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const patient = await prisma.patient.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
    if (!patient) {
      console.error(`No patient with the email ${email}.`);
      process.exit(1);
    }
    // Done only when both photos are this patient's own uploads and each has a passed check; ids copied
    // from another patient (or never checked) don't count, and are replaced below.
    const existing = await prisma.onboardingSubmission.findUnique({ where: { patientId: patient.id }, select: { bodyPhotoFrontFileId: true, bodyPhotoSideFileId: true } });
    const valid = async (fileId: string | null | undefined, kind: 'BODY_PHOTO_FRONT' | 'BODY_PHOTO_SIDE', view: 'FRONT' | 'SIDE') =>
      !!fileId &&
      !!(await prisma.uploadedFile.findFirst({ where: { id: fileId, patientId: patient.id, kind }, select: { id: true } })) &&
      !!(await prisma.bodyPhotoCheck.findFirst({ where: { patientId: patient.id, fileId, view, outcome: 'PASS' }, select: { id: true } }));
    if ((await valid(existing?.bodyPhotoFrontFileId, 'BODY_PHOTO_FRONT', 'FRONT')) && (await valid(existing?.bodyPhotoSideFileId, 'BODY_PHOTO_SIDE', 'SIDE'))) {
      console.log('Both body photos are already on file and checked — nothing to do.');
      return;
    }

    const root = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
    const make = async (kind: 'BODY_PHOTO_FRONT' | 'BODY_PHOTO_SIDE', view: 'FRONT' | 'SIDE') => {
      const filename = `dev-${view.toLowerCase()}.png`;
      const storageKey = `${patient.id}/dev-${Date.now()}-${filename}`;
      await mkdir(dirname(join(root, storageKey)), { recursive: true });
      await writeFile(join(root, storageKey), PLACEHOLDER);
      const file = await prisma.uploadedFile.create({ data: { patientId: patient.id, kind, filename, mimeType: 'image/png', storageKey } });
      // A passed check, so the retake rule doesn't send the photo back.
      await prisma.bodyPhotoCheck.create({ data: { patientId: patient.id, fileId: file.id, view, outcome: 'PASS', issues: [], model: 'dev-placeholder' } });
      return file.id;
    };

    const front = await make('BODY_PHOTO_FRONT', 'FRONT');
    const side = await make('BODY_PHOTO_SIDE', 'SIDE');
    await prisma.onboardingSubmission.upsert({
      where: { patientId: patient.id },
      create: { patientId: patient.id, bodyPhotoFrontFileId: front, bodyPhotoSideFileId: side, photoReviewStatus: 'APPROVED' },
      update: { bodyPhotoFrontFileId: front, bodyPhotoSideFileId: side, photoReviewStatus: 'APPROVED' },
    });
    console.log(`Marked the front and side body photos as done for ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
