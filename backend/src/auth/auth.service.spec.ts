import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { AuthService } from './auth.service';
import { UserRole } from '../common/enums';

jest.mock('bcryptjs');
jest.mock('otplib', () => ({ authenticator: { verify: jest.fn() } }));

describe('AuthService', () => {
  let prisma: {
    clinician: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    patient: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let email: { sendActivationEmail: jest.Mock };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let audit: { log: jest.Mock };
  let posthog: { identify: jest.Mock; capture: jest.Mock };
  let config: { get: jest.Mock };
  let service: AuthService;

  const CLINICIAN = {
    id: 'clinician-1',
    email: 'doc@clinic.dev',
    passwordHash: 'hashed',
    firstName: 'Dana',
    lastName: 'Doctor',
    role: 'DOCTOR',
    mfaEnabled: false,
    mfaSecret: null,
  };

  const PATIENT = {
    id: 'patient-1',
    email: 'pat@example.com',
    passwordHash: 'hashed',
    firstName: 'Pat',
    lastName: 'Ient',
    activatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      clinician: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      patient: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    email = { sendActivationEmail: jest.fn().mockResolvedValue(undefined) };
    jwtService = { sign: jest.fn().mockReturnValue('signed-token'), verify: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    posthog = { identify: jest.fn(), capture: jest.fn() };
    config = { get: jest.fn().mockReturnValue('7d') };
    service = new AuthService(prisma as any, jwtService as any, audit as any, posthog as any, config as any, email as any);
    jest.clearAllMocks();
  });

  describe('changePatientPassword', () => {
    const compare = bcrypt.compare as unknown as jest.Mock;
    const hash = bcrypt.hash as unknown as jest.Mock;

    it('saves a new hash and audits it when the current password is right', async () => {
      prisma.patient.findUnique.mockResolvedValue(PATIENT);
      compare.mockResolvedValue(true);
      hash.mockResolvedValue('new-hash');
      await expect(service.changePatientPassword('patient-1', 'old-password-1', 'new-password-12')).resolves.toBe(true);
      expect(prisma.patient.update).toHaveBeenCalledWith({ where: { id: 'patient-1' }, data: { passwordHash: 'new-hash' } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_PASSWORD_CHANGED', actorId: 'patient-1' }), prisma);
    });

    it('refuses, and records the attempt, when the current password is wrong', async () => {
      prisma.patient.findUnique.mockResolvedValue(PATIENT);
      compare.mockResolvedValue(false);
      await expect(service.changePatientPassword('patient-1', 'guess-guess-1', 'new-password-12')).rejects.toThrow(/current password/);
      expect(prisma.patient.update).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_PASSWORD_CHANGE_FAILED' }));
    });

    it('refuses a password that is too short, too long or the same as before, without looking anything up', async () => {
      await expect(service.changePatientPassword('patient-1', 'old-password-1', 'short')).rejects.toThrow(/between 10 and 72/);
      await expect(service.changePatientPassword('patient-1', 'old-password-1', 'x'.repeat(73))).rejects.toThrow(/between 10 and 72/);
      await expect(service.changePatientPassword('patient-1', 'same-password-1', 'same-password-1')).rejects.toThrow(/not already using/);
      expect(prisma.patient.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('loginClinician', () => {
    it('throws and audit-logs UNKNOWN_EMAIL when no clinician matches', async () => {
      prisma.clinician.findUnique.mockResolvedValue(null);

      await expect(service.loginClinician('nobody@clinic.dev', 'pw')).rejects.toThrow(UnauthorizedException);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUTH_LOGIN_FAILED', metadata: expect.objectContaining({ reason: 'UNKNOWN_EMAIL' }) }),
      );
    });

    it('throws and audit-logs BAD_PASSWORD when the password does not match', async () => {
      prisma.clinician.findUnique.mockResolvedValue(CLINICIAN);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.loginClinician(CLINICIAN.email, 'wrong')).rejects.toThrow(UnauthorizedException);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUTH_LOGIN_FAILED', metadata: expect.objectContaining({ reason: 'BAD_PASSWORD' }) }),
      );
    });

    it('returns mfaRequired with a pending token, no access token, when MFA is enabled', async () => {
      prisma.clinician.findUnique.mockResolvedValue({ ...CLINICIAN, mfaEnabled: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.loginClinician(CLINICIAN.email, 'correct');

      expect(result.mfaRequired).toBe(true);
      expect(result.accessToken).toBeNull();
      expect(result.pendingToken).toBe('signed-token');
    });

    it('returns an access token and identifies the clinician in posthog on success', async () => {
      prisma.clinician.findUnique.mockResolvedValue(CLINICIAN);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.loginClinician(CLINICIAN.email, 'correct');

      expect(result.mfaRequired).toBe(false);
      expect(result.accessToken).toBe('signed-token');
      expect(result.clinician).toBe(CLINICIAN);
      expect(posthog.identify).toHaveBeenCalledWith(CLINICIAN.id, expect.objectContaining({ email: CLINICIAN.email }));
    });
  });

  describe('loginPatient', () => {
    const ATTEMPT = { ip: '203.0.113.7', userAgent: 'jest' };

    it('throws and audit-logs NOT_ACTIVATED when the account has not been activated', async () => {
      prisma.patient.findUnique.mockResolvedValue({ ...PATIENT, activatedAt: null });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.loginPatient(PATIENT.email, 'correct', ATTEMPT)).rejects.toThrow(UnauthorizedException);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUTH_LOGIN_FAILED', metadata: expect.objectContaining({ reason: 'NOT_ACTIVATED' }) }),
      );
    });

    it('throws and audit-logs UNKNOWN_EMAIL, with IP and user agent, when no patient matches', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.loginPatient('nobody@example.com', 'pw', ATTEMPT)).rejects.toThrow('Invalid credentials');

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_LOGIN_FAILED',
          actorRole: UserRole.PATIENT,
          metadata: { email: 'nobody@example.com', reason: 'UNKNOWN_EMAIL', ...ATTEMPT },
        }),
      );
    });

    it('throws and audit-logs BAD_PASSWORD when the password does not match', async () => {
      prisma.patient.findUnique.mockResolvedValue(PATIENT);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.loginPatient(PATIENT.email, 'wrong', ATTEMPT)).rejects.toThrow('Invalid credentials');

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_LOGIN_FAILED',
          resourceId: PATIENT.id,
          metadata: expect.objectContaining({ reason: 'BAD_PASSWORD' }),
        }),
      );
    });

    it('returns an access token and refresh token for an activated patient with the right password', async () => {
      prisma.patient.findUnique.mockResolvedValue(PATIENT);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.loginPatient(PATIENT.email, 'correct');

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(result.patient).toBe(PATIENT);
    });
  });

  describe('verifyMfa', () => {
    const PENDING_PAYLOAD = { sub: CLINICIAN.id, mfaPending: true };

    it('rejects a token that is not a pending-MFA token', async () => {
      jwtService.verify.mockReturnValue({ sub: CLINICIAN.id, mfaPending: false });

      await expect(service.verifyMfa('token', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('audit-logs AUTH_MFA_FAILED and throws on a wrong TOTP code', async () => {
      jwtService.verify.mockReturnValue(PENDING_PAYLOAD);
      prisma.clinician.findUnique.mockResolvedValue({ ...CLINICIAN, mfaSecret: 'secret' });
      (authenticator.verify as jest.Mock).mockReturnValue(false);

      await expect(service.verifyMfa('token', '000000')).rejects.toThrow(UnauthorizedException);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_MFA_FAILED' }));
    });

    it('returns an access token and audit-logs AUTH_MFA_VERIFIED on a correct TOTP code', async () => {
      jwtService.verify.mockReturnValue(PENDING_PAYLOAD);
      prisma.clinician.findUnique.mockResolvedValue({ ...CLINICIAN, mfaSecret: 'secret' });
      (authenticator.verify as jest.Mock).mockReturnValue(true);

      const result = await service.verifyMfa('token', '123456');

      expect(result.accessToken).toBe('signed-token');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_MFA_VERIFIED' }));
    });
  });

  describe('refreshAccessToken', () => {
    it('rejects an expired or invalid refresh token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refreshAccessToken('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token that is not a refresh token', async () => {
      jwtService.verify.mockReturnValue({ sub: CLINICIAN.id, role: UserRole.CLINICIAN, type: 'access' });

      await expect(service.refreshAccessToken('token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a refresh token for a clinician that no longer exists', async () => {
      jwtService.verify.mockReturnValue({ sub: CLINICIAN.id, role: CLINICIAN.role, type: 'refresh' });
      prisma.clinician.findUnique.mockResolvedValue(null);

      await expect(service.refreshAccessToken('token')).rejects.toThrow(UnauthorizedException);
    });

    it('issues a new access + refresh token pair for a valid refresh token', async () => {
      jwtService.verify.mockReturnValue({ sub: CLINICIAN.id, role: CLINICIAN.role, type: 'refresh' });
      prisma.clinician.findUnique.mockResolvedValue(CLINICIAN);

      const result = await service.refreshAccessToken('token');

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
    });

    it('issues a new token pair for a valid patient refresh token', async () => {
      jwtService.verify.mockReturnValue({ sub: PATIENT.id, role: UserRole.PATIENT, type: 'refresh' });
      prisma.patient.findUnique.mockResolvedValue(PATIENT);

      const result = await service.refreshAccessToken('token');

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(prisma.patient.findUnique).toHaveBeenCalledWith({ where: { id: PATIENT.id } });
    });

    it('rejects a refresh token for a patient that no longer exists', async () => {
      jwtService.verify.mockReturnValue({ sub: PATIENT.id, role: UserRole.PATIENT, type: 'refresh' });
      prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.refreshAccessToken('token')).rejects.toThrow(UnauthorizedException);
    });
  });
  describe('requestActivationLink', () => {
    const PENDING = { ...PATIENT, activatedAt: null };

    it('emails a fresh link to a patient who has not activated yet', async () => {
      prisma.patient.findFirst.mockResolvedValue(PENDING);
      prisma.patient.update.mockResolvedValue(PENDING);
      config.get.mockImplementation((key: string) => (key === 'PATIENT_APP_URL' ? 'https://app.example.com' : '7d'));

      await expect(service.requestActivationLink(' Pat@Example.com ')).resolves.toBe(true);

      const saved = prisma.patient.update.mock.calls[0][0].data;
      expect(saved.activationToken).toMatch(/^[0-9a-f]{64}$/);
      expect(saved.activationTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(email.sendActivationEmail).toHaveBeenCalledWith(
        PENDING.email,
        PENDING.firstName,
        `https://app.example.com/activate?token=${saved.activationToken}`,
      );
    });

    it('reuses a link that is still valid instead of replacing it', async () => {
      const valid = { ...PENDING, activationToken: 'existing-token', activationTokenExpiresAt: new Date(Date.now() + 60_000) };
      prisma.patient.findFirst.mockResolvedValue(valid);
      config.get.mockImplementation((key: string) => (key === 'PATIENT_APP_URL' ? 'https://app.example.com' : '7d'));

      await service.requestActivationLink(PENDING.email);

      expect(prisma.patient.update).not.toHaveBeenCalled();
      expect(email.sendActivationEmail).toHaveBeenCalledWith(PENDING.email, PENDING.firstName, 'https://app.example.com/activate?token=existing-token');
    });

    it('issues a new link when the old one has expired', async () => {
      prisma.patient.findFirst.mockResolvedValue({ ...PENDING, activationToken: 'old', activationTokenExpiresAt: new Date(Date.now() - 1000) });
      prisma.patient.update.mockResolvedValue(PENDING);
      await service.requestActivationLink(PENDING.email);
      expect(prisma.patient.update.mock.calls[0][0].data.activationToken).not.toBe('old');
    });

    it('still resolves true but sends nothing for an unknown address', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);
      await expect(service.requestActivationLink('nobody@example.com')).resolves.toBe(true);
      expect(email.sendActivationEmail).not.toHaveBeenCalled();
    });

    it('sends nothing to an already-activated patient', async () => {
      prisma.patient.findFirst.mockResolvedValue(PATIENT);
      await expect(service.requestActivationLink(PATIENT.email)).resolves.toBe(true);
      expect(prisma.patient.update).not.toHaveBeenCalled();
      expect(email.sendActivationEmail).not.toHaveBeenCalled();
    });

    it('swallows a mail failure so the response does not reveal the account', async () => {
      prisma.patient.findFirst.mockResolvedValue(PENDING);
      prisma.patient.update.mockResolvedValue(PENDING);
      email.sendActivationEmail.mockRejectedValue(new Error('Resend down'));
      await expect(service.requestActivationLink(PENDING.email)).resolves.toBe(true);
    });
  });

  describe('activateAccount', () => {
    const GOOD_PASSWORD = 'a-long-enough-password';
    const PENDING = { ...PATIENT, activatedAt: null, activationToken: 'tok', activationTokenExpiresAt: new Date(Date.now() + 60_000) };

    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      prisma.patient.updateMany.mockResolvedValue({ count: 1 });
    });

    it('sets the password, activates, clears the token and signs the patient in', async () => {
      prisma.patient.findUnique.mockResolvedValue(PENDING);

      const result = await service.activateAccount('tok', GOOD_PASSWORD);

      expect(prisma.patient.updateMany).toHaveBeenCalledWith({
        where: { id: PENDING.id, activationToken: 'tok' },
        data: {
          passwordHash: 'new-hash',
          activatedAt: expect.any(Date),
          activationToken: null,
          activationTokenExpiresAt: null,
        },
      });
      expect(result.accessToken).toBe('signed-token');
      expect(result.patient.activatedAt).toBeInstanceOf(Date);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_ACCOUNT_ACTIVATED', resourceId: PENDING.id }), prisma);
    });

    it('does not leave the account changed when the audit write fails (one transaction)', async () => {
      prisma.patient.findUnique.mockResolvedValue(PENDING);
      audit.log.mockRejectedValueOnce(new Error('audit down'));
      await expect(service.activateAccount('tok', GOOD_PASSWORD)).rejects.toThrow('audit down');
      // The change and the audit row share one transaction, so the rejection rolls both back.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(expect.anything(), prisma);
    });

    it('rejects an unknown token', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);
      await expect(service.activateAccount('nope', GOOD_PASSWORD)).rejects.toThrow(UnauthorizedException);
      expect(prisma.patient.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      prisma.patient.findUnique.mockResolvedValue({ ...PENDING, activationTokenExpiresAt: new Date(Date.now() - 1000) });
      await expect(service.activateAccount('tok', GOOD_PASSWORD)).rejects.toThrow(UnauthorizedException);
      expect(prisma.patient.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a token that was spent by a concurrent request', async () => {
      prisma.patient.findUnique.mockResolvedValue(PENDING);
      prisma.patient.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.activateAccount('tok', GOOD_PASSWORD)).rejects.toThrow(UnauthorizedException);
    });

    it.each(['short', 'x'.repeat(73)])('rejects a password outside 10-72 characters (%#)', async (password) => {
      await expect(service.activateAccount('tok', password)).rejects.toThrow(BadRequestException);
      expect(prisma.patient.findUnique).not.toHaveBeenCalled();
    });
  });
  describe('team accounts', () => {
    const compare = bcrypt.compare as unknown as jest.Mock;
    const hash = bcrypt.hash as unknown as jest.Mock;
    const future = () => new Date(Date.now() + 86_400_000);

    it('refuses a deactivated clinician at sign-in, but only after the password was right', async () => {
      prisma.clinician.findUnique.mockResolvedValue({ ...CLINICIAN, deactivatedAt: new Date() });
      compare.mockResolvedValue(true);
      await expect(service.loginClinician('doc@clinic.dev', 'right-password')).rejects.toThrow(/deactivated/);
      expect(jwtService.sign).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_LOGIN_FAILED', metadata: expect.objectContaining({ reason: 'DEACTIVATED' }) }));

      compare.mockResolvedValue(false);
      await expect(service.loginClinician('doc@clinic.dev', 'wrong')).rejects.toThrow('Invalid credentials'); // not told it exists
    });

    it('stops a deactivated clinician refreshing a session', async () => {
      jwtService.verify.mockReturnValue({ sub: 'clinician-1', role: 'DOCTOR', type: 'refresh' });
      prisma.clinician.findUnique.mockResolvedValue({ ...CLINICIAN, deactivatedAt: new Date() });
      await expect(service.refreshAccessToken('refresh-token')).rejects.toMatchObject({ response: expect.objectContaining({ reason: 'ACCOUNT_DEACTIVATED' }) });
    });

    it('sets the password with a valid link, spends it, records it, and does not sign anyone in', async () => {
      hash.mockResolvedValue('new-hash');
      prisma.clinician.findUnique.mockResolvedValue({ ...CLINICIAN, passwordSetAt: null, inviteToken: 'tok', inviteTokenExpiresAt: future(), deactivatedAt: null });
      (prisma.clinician as any).updateMany = jest.fn().mockResolvedValue({ count: 1 });
      await expect(service.acceptClinicianInvite('tok', 'a-long-enough-password')).resolves.toBe(true);
      expect((prisma.clinician as any).updateMany).toHaveBeenCalledWith({
        // The link is checked again as it is spent: still unexpired, account still on.
        where: { id: 'clinician-1', inviteToken: 'tok', inviteTokenExpiresAt: { gt: expect.any(Date) }, deactivatedAt: null },
        data: { passwordHash: 'new-hash', passwordSetAt: expect.any(Date), inviteToken: null, inviteTokenExpiresAt: null },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_INVITE_ACCEPTED', metadata: expect.objectContaining({ firstTime: true }) }), prisma);
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('refuses a short password before looking at the link', async () => {
      await expect(service.acceptClinicianInvite('tok', 'short')).rejects.toThrow(BadRequestException);
      expect(prisma.clinician.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown link', null],
      ['an expired link', { ...CLINICIAN, inviteToken: 'tok', inviteTokenExpiresAt: new Date(Date.now() - 1000), deactivatedAt: null }],
      ['a link for a deactivated account', { ...CLINICIAN, inviteToken: 'tok', inviteTokenExpiresAt: future(), deactivatedAt: new Date() }],
    ])('refuses %s, with the same message each time', async (_n, found) => {
      prisma.clinician.findUnique.mockResolvedValue(found);
      await expect(service.acceptClinicianInvite('tok', 'a-long-enough-password')).rejects.toThrow('invalid or has expired');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_INVITE_FAILED' }));
    });

    it('finds a clinician whatever capitals they type their address with, preferring the address exactly as typed', async () => {
      compare.mockResolvedValue(true);
      // Saved lower-case by team management; typed with capitals and a stray space.
      prisma.clinician.findUnique.mockResolvedValue(null);
      prisma.clinician.findFirst.mockResolvedValue({ ...CLINICIAN, deactivatedAt: null, mfaEnabled: false });
      await expect(service.loginClinician('  Doc@Clinic.DEV ', 'right-password')).resolves.toMatchObject({ mfaRequired: false });
      expect(prisma.clinician.findUnique).toHaveBeenCalledWith({ where: { email: 'Doc@Clinic.DEV' } });
      expect(prisma.clinician.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: 'Doc@Clinic.DEV', mode: 'insensitive' } } }));

      // An exact match is used as it is, without the wider search.
      prisma.clinician.findFirst.mockClear();
      prisma.clinician.findUnique.mockResolvedValue({ ...CLINICIAN, deactivatedAt: null, mfaEnabled: false });
      await service.loginClinician(CLINICIAN.email, 'right-password');
      expect(prisma.clinician.findFirst).not.toHaveBeenCalled();
    });

    it('lets only one of two racing requests use the link', async () => {
      hash.mockResolvedValue('h');
      prisma.clinician.findUnique.mockResolvedValue({ ...CLINICIAN, inviteToken: 'tok', inviteTokenExpiresAt: future(), deactivatedAt: null });
      (prisma.clinician as any).updateMany = jest.fn().mockResolvedValue({ count: 0 });
      await expect(service.acceptClinicianInvite('tok', 'a-long-enough-password')).rejects.toThrow('invalid or has expired');
    });
  });
});
