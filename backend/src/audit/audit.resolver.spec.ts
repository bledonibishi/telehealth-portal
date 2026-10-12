import { BadRequestException } from '@nestjs/common';
import { AuditResolver } from './audit.resolver';

describe('AuditResolver', () => {
  let audit: any;
  let prisma: any;
  let resolver: AuditResolver;
  const admin = { id: 'admin-1', email: 'a@x.com', role: 'CLINICIAN' };

  beforeEach(() => {
    audit = { log: jest.fn().mockResolvedValue(undefined), search: jest.fn() };
    prisma = { clinician: { findMany: jest.fn().mockResolvedValue([]) }, patient: { findMany: jest.fn().mockResolvedValue([]) } };
    resolver = new AuditResolver(audit, prisma);
  });

  describe('auditLog', () => {
    it('names the clinician who acted and the patient it concerned', async () => {
      audit.search.mockResolvedValue({
        nextCursor: 'e-1',
        entries: [{ id: 'e-1', actorId: 'c-1', actorRole: 'CLINICIAN', action: 'RECORD_VIEWED', resourceType: 'Patient', resourceId: 'p-1', patientId: 'p-1', metadata: { via: 'patient' }, timestamp: new Date() }],
      });
      prisma.clinician.findMany.mockResolvedValue([{ id: 'c-1', firstName: 'Ana', lastName: 'Doe' }]);
      prisma.patient.findMany.mockResolvedValue([{ id: 'p-1', firstName: 'Ben', lastName: 'Roe' }]);

      const page = await resolver.auditLog({});

      expect(page.nextCursor).toBe('e-1');
      expect(page.entries[0]).toMatchObject({ actorName: 'Ana Doe', patientName: 'Ben Roe', metadata: '{"via":"patient"}' });
    });

    it('leaves names empty for an actor that no longer exists', async () => {
      audit.search.mockResolvedValue({ nextCursor: null, entries: [{ id: 'e-1', actorId: 'gone', actorRole: 'PATIENT', action: 'X', resourceType: 'Y', resourceId: 'z', patientId: null, metadata: null, timestamp: new Date() }] });
      const page = await resolver.auditLog();
      expect(page.entries[0]).toMatchObject({ actorName: null, patientName: null, metadata: null });
    });
  });

  describe('recordDataExport', () => {
    it('writes an audit entry saying who exported which table and how many rows', async () => {
      await expect(resolver.recordDataExport(admin, { resource: 'patients', rowCount: 42 })).resolves.toBe(true);
      expect(audit.log).toHaveBeenCalledWith({
        actorId: 'admin-1',
        actorRole: 'CLINICIAN',
        action: 'DATA_EXPORTED',
        resourceType: 'Export',
        resourceId: 'patients',
        metadata: { rowCount: 42 },
      });
    });

    it('refuses a table that cannot be exported', async () => {
      await expect(resolver.recordDataExport(admin, { resource: 'passwords', rowCount: 1 })).rejects.toThrow(BadRequestException);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
