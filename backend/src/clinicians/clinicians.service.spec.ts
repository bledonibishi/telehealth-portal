import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CliniciansService, MAX_BIO_LENGTH } from './clinicians.service';

describe('CliniciansService.updateProfile', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: CliniciansService;
  const before = { id: 'c-1', specialty: 'GP', bio: null, languages: ['Albanian'] };

  beforeEach(() => {
    prisma = { clinician: { findUnique: jest.fn().mockResolvedValue(before), update: jest.fn().mockResolvedValue({ id: 'c-1' }) } };
    audit = { log: jest.fn() };
    service = new CliniciansService(prisma, audit as any, { sendClinicianInviteEmail: jest.fn() } as any, { get: jest.fn() } as any);
  });

  it('saves the trimmed profile and records what it changed from', async () => {
    await service.updateProfile('admin-1', { clinicianId: 'c-1', specialty: '  Endocrinologist ', bio: ' 10 years with GLP-1 treatment ', languages: [' Albanian', 'English '] });
    expect(prisma.clinician.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { specialty: 'Endocrinologist', bio: '10 years with GLP-1 treatment', languages: ['Albanian', 'English'] },
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CLINICIAN_PROFILE_UPDATED',
      resourceId: 'c-1',
      metadata: { from: { specialty: 'GP', bio: null, languages: ['Albanian'] }, to: { specialty: 'Endocrinologist', bio: '10 years with GLP-1 treatment', languages: ['Albanian', 'English'] } },
    }));
  });

  it('clears a field sent empty', async () => {
    await service.updateProfile('admin-1', { clinicianId: 'c-1', specialty: '  ', languages: [] });
    expect(prisma.clinician.update).toHaveBeenCalledWith({ where: { id: 'c-1' }, data: { specialty: null, languages: [] } });
  });

  it('leaves alone a field that was not sent, so a partial update never wipes the rest', async () => {
    await service.updateProfile('admin-1', { clinicianId: 'c-1', bio: 'New bio' });
    expect(prisma.clinician.update).toHaveBeenCalledWith({ where: { id: 'c-1' }, data: { bio: 'New bio' } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: { from: { bio: null }, to: { bio: 'New bio' } } }));
  });

  it('lists a language once however it is capitalised, and drops blanks', async () => {
    await service.updateProfile('admin-1', { clinicianId: 'c-1', languages: ['English', 'english', ' ', 'German'] });
    expect(prisma.clinician.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ languages: ['English', 'German'] }) }));
  });

  it('refuses text that is too long, and too many languages', async () => {
    await expect(service.updateProfile('a', { clinicianId: 'c-1', bio: 'x'.repeat(MAX_BIO_LENGTH + 1) })).rejects.toThrow(BadRequestException);
    await expect(service.updateProfile('a', { clinicianId: 'c-1', languages: Array.from({ length: 9 }, (_, i) => `L${i}`) })).rejects.toThrow(/up to 8 languages/);
    expect(prisma.clinician.update).not.toHaveBeenCalled();
  });

  it('refuses an unknown clinician', async () => {
    prisma.clinician.findUnique.mockResolvedValue(null);
    await expect(service.updateProfile('a', { clinicianId: 'nope' })).rejects.toThrow(NotFoundException);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
