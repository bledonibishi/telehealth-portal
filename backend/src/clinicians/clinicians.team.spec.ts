import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CliniciansService, cleanEmail } from './clinicians.service';

describe('CliniciansService team management', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let email: { sendClinicianInviteEmail: jest.Mock };
  let config: { get: jest.Mock };
  let service: CliniciansService;
  const row = (over: object = {}) => ({ id: 'c-2', email: 'new@clinic.dev', firstName: 'Nia', lastName: 'Doe', role: 'DOCTOR', deactivatedAt: null, passwordSetAt: new Date('2026-09-01'), inviteToken: null, inviteTokenExpiresAt: null, ...over });

  beforeEach(() => {
    prisma = {
      clinician: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(row()),
        create: jest.fn(({ data }) => Promise.resolve(row({ ...data, id: 'c-new', passwordSetAt: null }))),
        update: jest.fn(({ data }) => Promise.resolve(row(data))),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      consultation: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
    };
    audit = { log: jest.fn() };
    email = { sendClinicianInviteEmail: jest.fn().mockResolvedValue(true) };
    config = { get: jest.fn((k: string) => (k === 'CLINICIAN_APP_URL' ? 'https://clinic.example.com/' : undefined)) };
    service = new CliniciansService(prisma, audit as any, email as any, config as any);
  });

  describe('cleanEmail', () => {
    it('trims and lower-cases, and refuses what is not an address', () => {
      expect(cleanEmail('  Dr.Arta@Clinic.DEV ')).toBe('dr.arta@clinic.dev');
      for (const bad of ['', 'no-at-sign', 'a@b', 'a b@c.com', undefined]) expect(() => cleanEmail(bad as any)).toThrow(BadRequestException);
    });
  });

  describe('create', () => {
    const input = { firstName: ' Nia ', lastName: 'Doe', email: ' New@Clinic.dev ', role: 'DOCTOR' as any };

    it('adds the member with their role, an unguessable placeholder password and a 7-day link, and emails the link', async () => {
      const { clinician, delivery } = await service.create('admin-1', input);
      const data = prisma.clinician.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ firstName: 'Nia', lastName: 'Doe', email: 'new@clinic.dev', role: 'DOCTOR' });
      expect(data.passwordHash).toMatch(/^\$2[aby]\$/); // a real hash of a random value, never anything the admin typed
      expect(data.passwordSetAt).toBeNull(); // an invitation says so on purpose: the column defaults to now for every other way of creating an account
      expect(data.inviteToken).toHaveLength(64);
      expect(data.inviteTokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
      expect(email.sendClinicianInviteEmail).toHaveBeenCalledWith('new@clinic.dev', 'Nia', `https://clinic.example.com/accept-invite?token=${data.inviteToken}`, true);
      expect(delivery).toEqual({ emailSent: true });
      expect(clinician.id).toBe('c-new');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLINICIAN_CREATED', metadata: { email: 'new@clinic.dev', role: 'DOCTOR' } }), prisma);
    });

    it('hands the admin the link when the email did not go out, so the new member is not stranded', async () => {
      email.sendClinicianInviteEmail.mockResolvedValue(false);
      const { delivery } = await service.create('admin-1', input);
      expect(delivery.emailSent).toBe(false);
      expect(delivery.inviteUrl).toMatch(/^https:\/\/clinic\.example\.com\/accept-invite\?token=[0-9a-f]{64}$/);
    });

    it('logs why sending failed, without the link, which is as good as a password', async () => {
      const logged = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
      email.sendClinicianInviteEmail.mockRejectedValue(new Error('provider down'));
      const { delivery } = await service.create('admin-1', input);
      expect(delivery.emailSent).toBe(false);
      expect(logged).toHaveBeenCalledWith(expect.stringContaining('provider down'), expect.stringContaining('Error: provider down'));
      const token = prisma.clinician.create.mock.calls[0][0].data.inviteToken;
      expect(JSON.stringify(logged.mock.calls)).not.toContain(token);
    });

    it('still creates the account when sending throws', async () => {
      email.sendClinicianInviteEmail.mockRejectedValue(new Error('provider down'));
      const { clinician, delivery } = await service.create('admin-1', input);
      expect(clinician.id).toBe('c-new');
      expect(delivery.emailSent).toBe(false);
    });

    it('refuses an address already on the team, in any capitals, and a race that slips past the check', async () => {
      prisma.clinician.findFirst.mockResolvedValue({ id: 'x' });
      await expect(service.create('admin-1', input)).rejects.toThrow(ConflictException);
      expect(prisma.clinician.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: 'new@clinic.dev', mode: 'insensitive' } } }));
      prisma.clinician.findFirst.mockResolvedValue(null);
      prisma.clinician.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
      await expect(service.create('admin-1', input)).rejects.toThrow(ConflictException);
    });

    it.each([[{ firstName: ' ' }], [{ lastName: '' }], [{ email: 'nope' }], [{ role: 'OWNER' }], [{ firstName: 'x'.repeat(61) }]])('refuses bad input %j', async (over) => {
      await expect(service.create('admin-1', { ...input, ...(over as object) } as any)).rejects.toThrow(BadRequestException);
      expect(prisma.clinician.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('changes only what was sent and records the before and after', async () => {
      await service.update('admin-1', { clinicianId: 'c-2', firstName: ' Nina ' });
      expect(prisma.clinician.update).toHaveBeenCalledWith({ where: { id: 'c-2' }, data: { firstName: 'Nina' } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLINICIAN_DETAILS_CHANGED', metadata: { from: { firstName: 'Nia' }, to: { firstName: 'Nina' } } }), prisma);
    });

    it('refuses an email that belongs to someone else, but not their own', async () => {
      prisma.clinician.findFirst.mockResolvedValue({ id: 'other' });
      await expect(service.update('admin-1', { clinicianId: 'c-2', email: 'taken@clinic.dev' })).rejects.toThrow(ConflictException);
      expect(prisma.clinician.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { not: 'c-2' } }) }));
    });

    describe('when the email changes', () => {
      const pending = { passwordSetAt: null, inviteToken: 'old-link', inviteTokenExpiresAt: new Date(Date.now() + 86_400_000) };

      it('stops the invitation sent to the old address working, in the same write, and sends a new one to the new address', async () => {
        prisma.clinician.findUnique.mockResolvedValue(row(pending));
        await service.update('admin-1', { clinicianId: 'c-2', email: 'Right@Clinic.dev' });
        const data = prisma.clinician.update.mock.calls[0][0].data;
        expect(data.email).toBe('right@clinic.dev');
        expect(data.inviteToken).toEqual(expect.any(String));
        expect(data.inviteToken).not.toBe('old-link');
        expect(data.inviteTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
        expect(email.sendClinicianInviteEmail).toHaveBeenCalledWith('right@clinic.dev', 'Nia', `https://clinic.example.com/accept-invite?token=${data.inviteToken}`, true);
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLINICIAN_DETAILS_CHANGED', metadata: expect.objectContaining({ oldLinkVoided: true, newInvitationSent: true }) }), prisma);
      });

      it('only voids a password link for someone who already has a password: no email goes out unasked', async () => {
        prisma.clinician.findUnique.mockResolvedValue(row({ ...pending, passwordSetAt: new Date('2026-09-01') }));
        await service.update('admin-1', { clinicianId: 'c-2', email: 'right@clinic.dev' });
        expect(prisma.clinician.update.mock.calls[0][0].data).toMatchObject({ inviteToken: null, inviteTokenExpiresAt: null });
        expect(email.sendClinicianInviteEmail).not.toHaveBeenCalled();
      });

      it('leaves a link alone when the address is the same, or only the name changed', async () => {
        prisma.clinician.findUnique.mockResolvedValue(row(pending));
        await service.update('admin-1', { clinicianId: 'c-2', email: ' NEW@clinic.dev ', firstName: 'Nina' }); // the same address, typed differently
        expect(prisma.clinician.update.mock.calls[0][0].data).toEqual({ email: 'new@clinic.dev', firstName: 'Nina' });
        expect(email.sendClinicianInviteEmail).not.toHaveBeenCalled();
      });
    });

    it('refuses an empty change and an unknown member', async () => {
      await expect(service.update('admin-1', { clinicianId: 'c-2' })).rejects.toThrow('Nothing to change');
      prisma.clinician.findUnique.mockResolvedValue(null);
      await expect(service.update('admin-1', { clinicianId: 'nope', firstName: 'A' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('turns the account off, voids any link, puts claimed consultations back in the queue, and says so in the audit log', async () => {
      await service.deactivate('admin-1', 'c-2');
      expect(prisma.clinician.update).toHaveBeenCalledWith({ where: { id: 'c-2' }, data: { deactivatedAt: expect.any(Date), inviteToken: null, inviteTokenExpiresAt: null } });
      expect(prisma.consultation.updateMany).toHaveBeenCalledWith({ where: { clinicianId: 'c-2', status: 'IN_REVIEW' }, data: { status: 'SUBMITTED', clinicianId: null } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLINICIAN_DEACTIVATED', metadata: { releasedConsultations: 2 } }), prisma);
    });

    it('will not let an admin deactivate themselves', async () => {
      await expect(service.deactivate('c-2', 'c-2')).rejects.toThrow('your own account');
      expect(prisma.clinician.update).not.toHaveBeenCalled();
    });

    it('does nothing twice', async () => {
      prisma.clinician.findUnique.mockResolvedValue(row({ deactivatedAt: new Date() }));
      await service.deactivate('admin-1', 'c-2');
      expect(prisma.clinician.update).not.toHaveBeenCalled();
    });

    it('can be undone', async () => {
      prisma.clinician.findUnique.mockResolvedValue(row({ deactivatedAt: new Date() }));
      await service.reactivate('admin-1', 'c-2');
      expect(prisma.clinician.update).toHaveBeenCalledWith({ where: { id: 'c-2' }, data: { deactivatedAt: null } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLINICIAN_REACTIVATED' }));
    });
  });

  describe('sendInvite', () => {
    it('replaces the link and says it is a first invitation only when they never set a password', async () => {
      prisma.clinician.findUnique.mockResolvedValue(row({ passwordSetAt: null }));
      await service.sendInvite('admin-1', 'c-2');
      expect(email.sendClinicianInviteEmail).toHaveBeenCalledWith('new@clinic.dev', 'Nia', expect.stringContaining('/accept-invite?token='), true);
      email.sendClinicianInviteEmail.mockClear();
      prisma.clinician.findUnique.mockResolvedValue(row());
      await service.sendInvite('admin-1', 'c-2');
      expect(email.sendClinicianInviteEmail).toHaveBeenCalledWith('new@clinic.dev', 'Nia', expect.any(String), false);
    });

    it('refuses to send one to a deactivated account', async () => {
      prisma.clinician.findUnique.mockResolvedValue(row({ deactivatedAt: new Date() }));
      await expect(service.sendInvite('admin-1', 'c-2')).rejects.toThrow('back on');
    });
  });

  describe('deleteUnused', () => {
    it('removes someone who never signed in, and records it', async () => {
      prisma.clinician.findUnique.mockResolvedValue(row({ passwordSetAt: null }));
      await expect(service.deleteUnused('admin-1', 'c-2')).resolves.toBe(true);
      expect(prisma.clinician.deleteMany).toHaveBeenCalledWith({ where: { id: 'c-2', passwordSetAt: null } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLINICIAN_DELETED' }), prisma);
    });

    it('keeps anyone who has used their account: their history stays, so they are deactivated, not deleted', async () => {
      await expect(service.deleteUnused('admin-1', 'c-2')).rejects.toThrow(/Deactivate it instead/);
      expect(prisma.clinician.deleteMany).not.toHaveBeenCalled();
    });

    it('keeps an account whose invitation was accepted a moment before the delete: nothing is removed or recorded as removed', async () => {
      prisma.clinician.findUnique.mockResolvedValue(row({ passwordSetAt: null })); // unused when read…
      prisma.clinician.deleteMany.mockResolvedValue({ count: 0 }); // …used by the time of the delete
      await expect(service.deleteUnused('admin-1', 'c-2')).rejects.toThrow(/Deactivate it instead/);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('will not delete the admin’s own account, and explains a record that still points at it', async () => {
      await expect(service.deleteUnused('c-2', 'c-2')).rejects.toThrow('your own account');
      prisma.clinician.findUnique.mockResolvedValue(row({ passwordSetAt: null }));
      prisma.clinician.deleteMany.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'x' }));
      await expect(service.deleteUnused('admin-1', 'c-2')).rejects.toThrow(/Deactivate it instead/);
    });
  });
});
