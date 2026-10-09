import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { AuthService } from './auth.service';
import { UserRole } from '../common/enums';
import { hashResetToken } from './password-reset-token';

jest.mock('bcryptjs');
jest.mock('otplib', () => ({ authenticator: { verify: jest.fn() } }));

describe('AuthService', () => {
  let prisma: {
    clinician: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
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
      clinician: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      patient: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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

  describe('changeOwnPassword', () => {
    const compare = bcrypt.compare as unknown as jest.Mock;
    const hash = bcrypt.hash as unknown as jest.Mock;
    const patientAccount = { id: 'patient-1', role: UserRole.PATIENT };

    it('saves a new hash, ends other sessions, audits it and returns fresh tokens when the current password is right', async () => {
      prisma.patient.findUnique.mockResolvedValue({ ...PATIENT, tokenVersion: 2 });
      compare.mockResolvedValue(true);
      hash.mockResolvedValue('new-hash');
      const tokens = await service.changeOwnPassword(patientAccount, 'old-password-1', 'new-password-12');
      expect(prisma.patient.updateMany).toHaveBeenCalledWith({ where: { id: 'patient-1', passwordHash: 'hashed', tokenVersion: 2 }, data: { passwordHash: 'new-hash', tokenVersion: { increment: 1 } } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_PASSWORD_CHANGED', actorId: 'patient-1' }), prisma);
      expect(jwtService.sign).toHaveBeenCalledWith(expect.objectContaining({ sub: 'patient-1', tv: 3 }));
      expect(tokens).toEqual({ accessToken: 'signed-token', refreshToken: 'signed-token' });
    });

    it('lets a clinician change theirs too', async () => {
      prisma.clinician.findUnique.mockResolvedValue({ ...CLINICIAN, tokenVersion: 0 });
      compare.mockResolvedValue(true);
      hash.mockResolvedValue('new-hash');
      await service.changeOwnPassword({ id: 'clinician-1', role: UserRole.CLINICIAN }, 'old-password-1', 'new-password-12');
      expect(prisma.clinician.updateMany).toHaveBeenCalledWith({ where: { id: 'clinician-1', passwordHash: 'hashed', tokenVersion: 0 }, data: expect.objectContaining({ passwordHash: 'new-hash', tokenVersion: { increment: 1 } }) });
      expect(jwtService.sign).toHaveBeenCalledWith(expect.objectContaining({ sub: 'clinician-1', role: 'DOCTOR', tv: 1 }));
    });

    it('fails, rather than hand back tokens that are already revoked, when another change got there first', async () => {
      prisma.patient.findUnique.mockResolvedValue({ ...PATIENT, tokenVersion: 2 });
      prisma.patient.updateMany.mockResolvedValue({ count: 0 });
      compare.mockResolvedValue(true);
      hash.mockResolvedValue('new-hash');
      await expect(service.changeOwnPassword(patientAccount, 'old-password-1', 'new-password-12')).rejects.toThrow(/changed somewhere else/);
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('refuses, and records the attempt, when the current password is wrong', async () => {
      prisma.patient.findUnique.mockResolvedValue(PATIENT);
      compare.mockResolvedValue(false);
      await expect(service.changeOwnPassword(patientAccount, 'guess-guess-1', 'new-password-12')).rejects.toThrow(/current password/);
      expect(prisma.patient.update).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_PASSWORD_CHANGE_FAILED' }));
    });

    it('refuses a password that is too short, too long, too easy or the same as before', async () => {
      prisma.patient.findUnique.mockResolvedValue(PATIENT);
      compare.mockResolvedValue(true);
      await expect(service.changeOwnPassword(patientAccount, 'old-password-1', 'short')).rejects.toThrow(/between 10 and 72/);
      await expect(service.changeOwnPassword(patientAccount, 'old-password-1', 'x'.repeat(73))).rejects.toThrow(/between 10 and 72/);
      await expect(service.changeOwnPassword(patientAccount, 'old-password-1', 'password123')).rejects.toThrow(/too easy/);
      await expect(service.changeOwnPassword(patientAccount, 'same-password-1', 'same-password-1')).rejects.toThrow(/not already using/);
      expect(prisma.patient.update).not.toHaveBeenCalled();
    });
  });

  describe('requestPasswordReset', () => {
    let reset: { deleteMany: jest.Mock; create: jest.Mock };
    beforeEach(() => {
      reset = { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'new-row' }) };
      (prisma as any).passwordReset = reset;
      (email as any).sendPasswordResetEmail = jest.fn().mockResolvedValue(true);
      config.get.mockImplementation((key: string) => (key === 'PATIENT_APP_URL' ? 'https://app.test' : '7d'));
    });

    it('emails a link and stores only its hash', async () => {
      prisma.patient.findFirst.mockResolvedValue(PATIENT);
      await expect(service.requestPasswordReset('pat@example.com', 'patient')).resolves.toBe(true);
      const sent = (email as any).sendPasswordResetEmail.mock.calls[0];
      const token = new URL(sent[2]).searchParams.get('token')!;
      expect(sent[2]).toMatch(/^https:\/\/app\.test\/reset-password\?token=/);
      const stored = reset.create.mock.calls[0][0].data;
      expect(stored.tokenHash).not.toBe(token);
      expect(stored.tokenHash).toBe(hashResetToken(token));
      // Older links go only after the new one was sent.
      await new Promise((r) => setImmediate(r));
      expect(reset.deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: { not: 'new-row' }, usedAt: null }) });
    });

    it('keeps the older link when the new email was not accepted', async () => {
      prisma.patient.findFirst.mockResolvedValue(PATIENT);
      (email as any).sendPasswordResetEmail.mockResolvedValue(false);
      await service.requestPasswordReset('pat@example.com', 'patient');
      await new Promise((r) => setImmediate(r));
      expect(reset.deleteMany).not.toHaveBeenCalled();
    });

    it('says true and sends nothing for an unknown address', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);
      await expect(service.requestPasswordReset('nobody@example.com', 'patient')).resolves.toBe(true);
      expect((email as any).sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('sends nothing to a deactivated or never-invited clinician', async () => {
      prisma.clinician.findFirst.mockResolvedValue({ ...CLINICIAN, deactivatedAt: new Date(), passwordSetAt: new Date() });
      await service.requestPasswordReset('doc@clinic.dev', 'staff');
      prisma.clinician.findFirst.mockResolvedValue({ ...CLINICIAN, deactivatedAt: null, passwordSetAt: null });
      await service.requestPasswordReset('doc@clinic.dev', 'staff');
      expect((email as any).sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const hash = bcrypt.hash as unknown as jest.Mock;
    let reset: { findUnique: jest.Mock; updateMany: jest.Mock; deleteMany: jest.Mock };
    const row = (over: object = {}) => ({ id: 'r1', accountType: 'PATIENT', accountId: 'patient-1', usedAt: null, expiresAt: new Date(Date.now() + 60_000), ...over });
    beforeEach(() => {
      reset = { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), deleteMany: jest.fn() };
      (prisma as any).passwordReset = reset;
      (email as any).sendPasswordChangedEmail = jest.fn().mockResolvedValue(true);
      hash.mockResolvedValue('new-hash');
    });

    it('sets the password, spends the link, ends other sessions and tells the owner', async () => {
      reset.findUnique.mockResolvedValue(row());
      prisma.patient.findUnique.mockResolvedValue(PATIENT);
      await expect(service.resetPassword('tok', 'a-good-password-1')).resolves.toBe(true);
      expect(reset.findUnique).toHaveBeenCalledWith({ where: { tokenHash: hashResetToken('tok') } });
      expect(prisma.patient.updateMany).toHaveBeenCalledWith({ where: { id: 'patient-1' }, data: { passwordHash: 'new-hash', tokenVersion: { increment: 1 } } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_PASSWORD_RESET' }), prisma);
      expect((email as any).sendPasswordChangedEmail).toHaveBeenCalled();
    });

    it.each([
      ['unknown', null],
      ['used', row({ usedAt: new Date() })],
      ['expired', row({ expiresAt: new Date(Date.now() - 1000) })],
    ])('rejects a %s link', async (_n, found) => {
      reset.findUnique.mockResolvedValue(found);
      await expect(service.resetPassword('tok', 'a-good-password-1')).rejects.toThrow(/invalid or has expired/);
      expect(prisma.patient.update).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_PASSWORD_RESET_FAILED' }));
    });

    it('loses cleanly when two requests race for the same link', async () => {
      reset.findUnique.mockResolvedValue(row());
      reset.updateMany.mockResolvedValue({ count: 0 });
      prisma.patient.findUnique.mockResolvedValue(PATIENT);
      await expect(service.resetPassword('tok', 'a-good-password-1')).rejects.toThrow(/invalid or has expired/);
      expect(prisma.patient.update).not.toHaveBeenCalled();
    });

    it('rolls the link back when a clinician was deactivated while the password was being hashed', async () => {
      reset.findUnique.mockResolvedValue(row({ accountType: 'CLINICIAN', accountId: 'clinician-1' }));
      prisma.clinician.findUnique.mockResolvedValue({ ...CLINICIAN, deactivatedAt: null });
      prisma.clinician.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.resetPassword('tok', 'a-good-password-1')).rejects.toThrow(/invalid or has expired/);
      expect(prisma.clinician.updateMany).toHaveBeenCalledWith({ where: { id: 'clinician-1', deactivatedAt: null }, data: expect.anything() });
    });

    it('refuses a weak password without spending the link', async () => {
      reset.findUnique.mockResolvedValue(row());
      prisma.patient.findUnique.mockResolvedValue(PATIENT);
      await expect(service.resetPassword('tok', 'short')).rejects.toThrow(BadRequestException);
      expect(reset.updateMany).not.toHaveBeenCalled();
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

    it('refuses a sign-in that was waiting for a code when the password changed or sessions were ended meanwhile', async () => {
      jwtService.verify.mockReturnValue({ ...PENDING_PAYLOAD, tv: 0 });
      prisma.clinician.findUnique.mockResolvedValue({ ...CLINICIAN, mfaSecret: 'secret', tokenVersion: 1 });
      (authenticator.verify as jest.Mock).mockReturnValue(true);

      await expect(service.verifyMfa('token', '123456')).rejects.toMatchObject({ response: expect.objectContaining({ reason: 'SESSION_REVOKED' }) });
      expect(jwtService.sign).not.toHaveBeenCalled();
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

    it('tells an already-activated patient a password is set, and sends nothing', async () => {
      prisma.patient.findFirst.mockResolvedValue(PATIENT);
      await expect(service.requestActivationLink(PATIENT.email)).rejects.toThrow(/password is already set/);
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
          tokenVersion: { increment: 1 },
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
        data: { passwordHash: 'new-hash', passwordSetAt: expect.any(Date), inviteToken: null, inviteTokenExpiresAt: null, tokenVersion: { increment: 1 } },
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
