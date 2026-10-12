import { InternalServerErrorException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { UserRole } from '../common/enums';

describe('AuditService', () => {
  let prisma: any;
  let service: AuditService;
  const entry = { actorId: 'doc-1', actorRole: UserRole.CLINICIAN, action: 'CONSULTATION_APPROVED', resourceType: 'Consultation', resourceId: 'c-1' };

  beforeEach(() => {
    prisma = { auditLogEntry: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) } };
    service = new AuditService(prisma);
  });

  it('stores the patient the action concerns', async () => {
    await service.log({ ...entry, patientId: 'p-1', metadata: { a: 1 } });
    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ patientId: 'p-1', action: 'CONSULTATION_APPROVED', metadata: { a: 1 } }) });
  });

  it('takes the patient from the resource when the resource is the patient', async () => {
    await service.log({ ...entry, resourceType: 'Patient', resourceId: 'p-9' });
    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ patientId: 'p-9' }) });
  });

  it('writes through the caller’s transaction when given one', async () => {
    const tx = { auditLogEntry: { create: jest.fn().mockResolvedValue({}) } };
    await service.log(entry, tx as any);
    expect(tx.auditLogEntry.create).toHaveBeenCalled();
    expect(prisma.auditLogEntry.create).not.toHaveBeenCalled();
  });

  it('fails loudly when the row cannot be written', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    prisma.auditLogEntry.create.mockRejectedValue(new Error('db down'));
    await expect(service.log(entry)).rejects.toThrow(InternalServerErrorException);
  });

  it('lists a patient’s trail oldest first', async () => {
    await service.findByPatient('p-1');
    expect(prisma.auditLogEntry.findMany).toHaveBeenCalledWith({ where: { patientId: 'p-1' }, orderBy: { timestamp: 'asc' } });
  });
  describe('search', () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a-${i}`, ...entry }));

    it('lists newest first and asks for one extra row to know whether more follow', async () => {
      await service.search({ limit: 10 });
      expect(prisma.auditLogEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 11, orderBy: [{ timestamp: 'desc' }, { id: 'desc' }] }));
    });

    it('returns a cursor to the last row shown when more follow', async () => {
      prisma.auditLogEntry.findMany.mockResolvedValue(rows(3));
      const page = await service.search({ limit: 2 });
      expect(page.entries.map((e) => e.id)).toEqual(['a-0', 'a-1']);
      expect(page.nextCursor).toBe('a-1');
    });

    it('has no cursor on the last page', async () => {
      prisma.auditLogEntry.findMany.mockResolvedValue(rows(2));
      expect((await service.search({ limit: 2 })).nextCursor).toBeNull();
    });

    it('continues after the cursor row without repeating it', async () => {
      await service.search({ cursor: 'a-1' });
      expect(prisma.auditLogEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ cursor: { id: 'a-1' }, skip: 1 }));
    });

    it('caps the page size', async () => {
      await service.search({ limit: 100000 });
      expect(prisma.auditLogEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 201 }));
    });

    it('filters by action text, patient and date range', async () => {
      const from = new Date('2026-10-01');
      const to = new Date('2026-10-08');
      await service.search({ action: ' order ', patientId: 'p-1', from, to });
      expect(prisma.auditLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { action: { contains: 'order', mode: 'insensitive' }, patientId: 'p-1', timestamp: { gte: from, lt: to } },
        }),
      );
    });
  });
});
