import { UnauthorizedException } from '@nestjs/common';
import { ORPHAN_AFTER_MS, UploadsCleanupService } from './uploads-cleanup.service';
import { UploadsCleanupController } from './uploads-cleanup.controller';

/** A stand-in database: the cleanup lists candidates, then locks and re-checks each one inside a transaction. */
function fakeDb(over: { candidates?: unknown[]; locked?: boolean; stillOrphan?: boolean } = {}) {
  const prisma: any = {
    uploadedFile: {
      findMany: jest.fn().mockResolvedValue(over.candidates ?? [{ id: 'f-1', patientId: 'p-1', storageKey: 'p-1/f-1.jpg' }]),
      count: jest.fn().mockResolvedValue(over.stillOrphan === false ? 0 : 1),
      delete: jest.fn().mockResolvedValue({}),
    },
    onboardingSubmission: { count: jest.fn().mockResolvedValue(over.stillOrphan === false ? 1 : 0) },
    // Tagged template: the candidate list and the row lock are told apart by their SQL.
    $queryRaw: jest.fn((strings: TemplateStringsArray) =>
      Promise.resolve(strings.join(' ').includes('FOR UPDATE') ? (over.locked === false ? [] : [{ id: 'locked' }]) : over.candidates ?? [{ id: 'f-1', patientId: 'p-1', storageKey: 'p-1/f-1.jpg' }]),
    ),
    $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
  };
  const storage = { put: jest.fn(), get: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn() };
  return { prisma, storage, audit, service: new UploadsCleanupService(prisma, audit as any, storage) };
}

describe('UploadsCleanupService', () => {
  const NOW = new Date('2026-10-05T03:00:00Z');

  it('only looks at progress photos older than a day that no weighing uses', async () => {
    const { service, prisma } = fakeDb();
    await service.purgeOrphanedProgressPhotos(NOW);
    const where = prisma.uploadedFile.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ kind: 'PROGRESS_PHOTO', weightEntry: null });
    expect(where.createdAt.lt).toEqual(new Date(NOW.getTime() - ORPHAN_AFTER_MS));
  });

  it('removes the stored bytes and then the record, and notes it against the patient', async () => {
    const { service, prisma, storage, audit } = fakeDb();
    expect(await service.purgeOrphanedProgressPhotos(NOW)).toBe(1);
    expect(storage.delete).toHaveBeenCalledWith('p-1/f-1.jpg');
    expect(prisma.uploadedFile.delete).toHaveBeenCalledWith({ where: { id: 'f-1' } });
    expect(storage.delete.mock.invocationCallOrder[0]).toBeLessThan(prisma.uploadedFile.delete.mock.invocationCallOrder[0]);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORPHAN_PHOTO_PURGED', patientId: 'p-1', resourceId: 'f-1' }));
  });

  it('leaves a photo alone if it was attached after it was listed', async () => {
    const { service, storage, prisma } = fakeDb({ stillOrphan: false });
    expect(await service.purgeOrphanedProgressPhotos(NOW)).toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.uploadedFile.delete).not.toHaveBeenCalled();
  });

  it('keeps the record when the storage cannot delete the bytes, so the next run tries again — and carries on past it', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, storage, prisma } = fakeDb({ candidates: [{ id: 'bad', patientId: 'p-1', storageKey: 'k1' }, { id: 'good', patientId: 'p-2', storageKey: 'k2' }] });
    storage.delete.mockRejectedValueOnce(new Error('S3 down'));
    expect(await service.purgeOrphanedProgressPhotos(NOW)).toBe(1);
    expect(prisma.uploadedFile.delete).toHaveBeenCalledTimes(1);
    expect(prisma.uploadedFile.delete).toHaveBeenCalledWith({ where: { id: 'good' } });
  });
});

describe('UploadsCleanupService.purgeOrphanedBodyPhotos', () => {
  const NOW = new Date('2026-10-05T03:00:00Z');

  it('lists only day-old body photos that no onboarding uses, before the batch is cut', async () => {
    const { service, prisma } = fakeDb();
    await service.purgeOrphanedBodyPhotos(NOW);
    const sql = (prisma.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join(' ');
    expect(sql).toContain("BODY_PHOTO_FRONT");
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('LIMIT');
    expect(prisma.$queryRaw.mock.calls[0]).toContainEqual(new Date(NOW.getTime() - ORPHAN_AFTER_MS));
  });

  it('removes an unused photo: locked, checked again, bytes first, then the record', async () => {
    const { service, prisma, storage, audit } = fakeDb({ candidates: [{ id: 'retaken', patientId: 'p-1', storageKey: 'r' }] });
    expect(await service.purgeOrphanedBodyPhotos(NOW)).toBe(1);
    const lock = prisma.$queryRaw.mock.calls.find((c: any[]) => (c[0] as TemplateStringsArray).join(' ').includes('FOR UPDATE'));
    expect(lock).toBeDefined();
    expect(prisma.onboardingSubmission.count).toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith('r');
    expect(prisma.uploadedFile.delete).toHaveBeenCalledWith({ where: { id: 'retaken' } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORPHAN_PHOTO_PURGED', resourceId: 'retaken' }));
  });

  it('does not delete a photo that was saved on an onboarding after it was listed', async () => {
    const { service, prisma, storage } = fakeDb({ stillOrphan: false });
    expect(await service.purgeOrphanedBodyPhotos(NOW)).toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.uploadedFile.delete).not.toHaveBeenCalled();
  });

  it('skips a photo that is already gone', async () => {
    const { service, storage } = fakeDb({ locked: false });
    expect(await service.purgeOrphanedBodyPhotos(NOW)).toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
  });
});

describe('UploadsCleanupController', () => {
  const build = (secret?: string) => {
    const cleanup = { purgeOrphanedProgressPhotos: jest.fn().mockResolvedValue(2), purgeOrphanedBodyPhotos: jest.fn().mockResolvedValue(1) };
    return { controller: new UploadsCleanupController({ get: jest.fn().mockReturnValue(secret) } as any, cleanup as any), cleanup };
  };

  it('needs the cron secret', async () => {
    const { controller, cleanup } = build('s3cret');
    await expect(controller.purge(undefined)).rejects.toThrow(UnauthorizedException);
    await expect(controller.purge('Bearer wrong')).rejects.toThrow(UnauthorizedException);
    await expect(build(undefined).controller.purge('Bearer anything')).rejects.toThrow(UnauthorizedException);
    expect(cleanup.purgeOrphanedProgressPhotos).not.toHaveBeenCalled();
    expect(await controller.purge('Bearer s3cret')).toEqual({ removed: 3 });
  });
});
