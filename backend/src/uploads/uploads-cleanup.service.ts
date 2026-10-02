import { Inject, Injectable, Logger } from '@nestjs/common';
import { UploadKind } from '@prisma/client';
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

    let removed = 0;
    for (const file of orphans) {
      try {
        // The record goes only if it is still unattached, so a photo attached a moment ago is never deleted.
        const { count } = await this.prisma.uploadedFile.deleteMany({ where: { id: file.id, weightEntry: null } });
        if (count === 0) continue;
        await this.storage.delete(file.storageKey);
        await this.audit.log({
          actorId: 'system:uploads-cleanup',
          actorRole: UserRole.ADMIN,
          action: 'ORPHAN_PHOTO_PURGED',
          resourceType: 'UploadedFile',
          resourceId: file.id,
          patientId: file.patientId,
        });
        removed++;
      } catch (err: any) {
        this.logger.error(`Could not purge upload ${file.id}: ${err?.message ?? err}`);
      }
    }
    return removed;
  }
}
