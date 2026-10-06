import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, UploadKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import { FILE_STORAGE, FileStorage } from './file-storage';

/** A photo is uploaded just before the weight it belongs to is saved, so one this old was never attached. */
export const ORPHAN_AFTER_MS = 24 * 3_600_000;
const BATCH = 100;

/**
 * Progress photos are uploaded first and attached when the weight is saved. If that save fails and
 * the patient walks away, the photo is left behind: sensitive, and reachable by nobody. This removes
 * those (the stored bytes and the record), and notes it in the audit log against the patient.
 */
@Injectable()
export class UploadsCleanupService {
  private readonly logger = new Logger(UploadsCleanupService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Inject(FILE_STORAGE) private storage: FileStorage,
  ) {}

  async purgeOrphanedProgressPhotos(now = new Date()): Promise<number> {
    const orphans = await this.prisma.uploadedFile.findMany({
      where: { kind: UploadKind.PROGRESS_PHOTO, createdAt: { lt: new Date(now.getTime() - ORPHAN_AFTER_MS) }, weightEntry: null },
      select: { id: true, patientId: true, storageKey: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    // Checked again under the lock, so a photo attached a moment ago is never deleted.
    return this.purgeAll(orphans, async (tx, file) => (await tx.uploadedFile.count({ where: { id: file.id, weightEntry: null } })) === 1);
  }

  /**
   * Body photos checked at onboarding and then retaken or abandoned: uploaded, but never saved on the
   * patient's onboarding (the portal deletes a retake itself; this is the net for a closed tab).
   */
  async purgeOrphanedBodyPhotos(now = new Date()): Promise<number> {
    // Saved photos are left out before the batch is cut, so they can never fill it and starve the rest.
    const orphans = await this.prisma.$queryRaw<Array<{ id: string; patientId: string; storageKey: string }>>`
      SELECT f.id, f.patient_id AS "patientId", f.storage_key AS "storageKey"
      FROM uploaded_files f
      WHERE f.kind IN ('BODY_PHOTO_FRONT', 'BODY_PHOTO_SIDE')
        AND f.created_at < ${new Date(now.getTime() - ORPHAN_AFTER_MS)}
        AND NOT EXISTS (
          SELECT 1 FROM onboarding_submissions s
          WHERE s.body_photo_front_file_id = f.id OR s.body_photo_side_file_id = f.id
        )
      ORDER BY f.created_at ASC
      LIMIT ${BATCH}`;
    return this.purgeAll(
      orphans,
      async (tx, file) => (await tx.onboardingSubmission.count({ where: { OR: [{ bodyPhotoFrontFileId: file.id }, { bodyPhotoSideFileId: file.id }] } })) === 0,
    );
  }

  private async purgeAll(files: Array<{ id: string; patientId: string; storageKey: string }>, stillOrphan: (tx: Prisma.TransactionClient, file: { id: string }) => Promise<boolean>): Promise<number> {
    let removed = 0;
    for (const file of files) {
      try {
        const gone = await this.prisma.$transaction(
          async (tx) => {
            // The record is locked while it is checked and deleted. Saving a photo onto an onboarding takes the same
            // lock, so one of the two goes first: a photo saved a moment ago is seen as in use, and one deleted a
            // moment ago can no longer be saved.
            const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM uploaded_files WHERE id = ${file.id} FOR UPDATE`;
            if (!locked.length || !(await stillOrphan(tx, file))) return false;
            // The bytes first: if the storage fails, the record stays and the next run tries again.
            await this.storage.delete(file.storageKey);
            await tx.uploadedFile.delete({ where: { id: file.id } });
            return true;
          },
          { timeout: 20_000 },
        );
        if (!gone) continue;
        await this.audit.log({ actorId: 'system:uploads-cleanup', actorRole: UserRole.ADMIN, action: 'ORPHAN_PHOTO_PURGED', resourceType: 'UploadedFile', resourceId: file.id, patientId: file.patientId });
        removed++;
      } catch (err: any) {
        this.logger.error(`Could not purge upload ${file.id}: ${err?.message ?? err}`);
      }
    }
    return removed;
  }
}
