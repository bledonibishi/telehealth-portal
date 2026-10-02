import { UnauthorizedException } from '@nestjs/common';
import { ORPHAN_AFTER_MS, UploadsCleanupService } from './uploads-cleanup.service';
import { UploadsCleanupController } from './uploads-cleanup.controller';

describe('UploadsCleanupService', () => {
  const NOW = new Date('2026-10-05T03:00:00Z');
  let prisma: any;
  let audit: { log: jest.Mock };
  let storage: { put: jest.Mock; get: jest.Mock; delete: jest.Mock };
  let service: UploadsCleanupService;

  beforeEach(() => {
    prisma = {
      uploadedFile: {
        findMany: jest.fn().mockResolvedValue([{ id: 'f-1', patientId: 'p-1', storageKey: 'p-1/f-1.jpg' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    audit = { log: jest.fn() };
    storage = { put: jest.fn(), get: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) };
    service = new UploadsCleanupService(prisma, audit as any, storage);
  });

  it('only looks at progress photos older than a day that no weighing uses', async () => {
    await service.purgeOrphanedProgressPhotos(NOW);
    const where = prisma.uploadedFile.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ kind: 'PROGRESS_PHOTO', weightEntry: null });
    expect(where.createdAt.lt).toEqual(new Date(NOW.getTime() - ORPHAN_AFTER_MS));
  });

  it('removes the record and the stored bytes, and notes it against the patient', async () => {
    expect(await service.purgeOrphanedProgressPhotos(NOW)).toBe(1);
    expect(prisma.uploadedFile.deleteMany).toHaveBeenCalledWith({ where: { id: 'f-1', weightEntry: null } });
    expect(storage.delete).toHaveBeenCalledWith('p-1/f-1.jpg');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORPHAN_PHOTO_PURGED', patientId: 'p-1', resourceId: 'f-1' }));
  });

  it('leaves a photo alone if it was attached after it was listed', async () => {
    prisma.uploadedFile.deleteMany.mockResolvedValue({ count: 0 });
    expect(await service.purgeOrphanedProgressPhotos(NOW)).toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('carries on past one that fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    prisma.uploadedFile.findMany.mockResolvedValue([
      { id: 'bad', patientId: 'p-1', storageKey: 'k1' },
      { id: 'good', patientId: 'p-2', storageKey: 'k2' },
    ]);
    storage.delete.mockRejectedValueOnce(new Error('S3 down'));
    expect(await service.purgeOrphanedProgressPhotos(NOW)).toBe(1);
  });
});

describe('UploadsCleanupController', () => {
  const build = (secret?: string) => {
    const cleanup = { purgeOrphanedProgressPhotos: jest.fn().mockResolvedValue(2) };
    return { controller: new UploadsCleanupController({ get: jest.fn().mockReturnValue(secret) } as any, cleanup as any), cleanup };
  };

  it('needs the cron secret', async () => {
    const { controller, cleanup } = build('s3cret');
    await expect(controller.purge(undefined)).rejects.toThrow(UnauthorizedException);
    await expect(controller.purge('Bearer wrong')).rejects.toThrow(UnauthorizedException);
    await expect(build(undefined).controller.purge('Bearer anything')).rejects.toThrow(UnauthorizedException);
    expect(cleanup.purgeOrphanedProgressPhotos).not.toHaveBeenCalled();
    expect(await controller.purge('Bearer s3cret')).toEqual({ removed: 2 });
  });
});
