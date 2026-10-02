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
});
