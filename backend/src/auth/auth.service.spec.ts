import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { AuthService } from './auth.service';
import { UserRole } from '../common/enums';

jest.mock('bcryptjs');
jest.mock('otplib', () => ({ authenticator: { verify: jest.fn() } }));

describe('AuthService', () => {
  let prisma: { clinician: { findUnique: jest.Mock; update: jest.Mock }; patient: { findUnique: jest.Mock } };
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
      clinician: { findUnique: jest.fn(), update: jest.fn() },
      patient: { findUnique: jest.fn() },
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed-token'), verify: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    posthog = { identify: jest.fn(), capture: jest.fn() };
    config = { get: jest.fn().mockReturnValue('7d') };
    service = new AuthService(prisma as any, jwtService as any, audit as any, posthog as any, config as any);
    jest.clearAllMocks();
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
    it('throws when the account has not been activated', async () => {
      prisma.patient.findUnique.mockResolvedValue({ ...PATIENT, activatedAt: null });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.loginPatient(PATIENT.email, 'correct')).rejects.toThrow(UnauthorizedException);
    });

    it('throws on a wrong password without leaking whether the email exists', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);

      await expect(service.loginPatient('nobody@example.com', 'pw')).rejects.toThrow(UnauthorizedException);
    });

    it('returns an access token for an activated patient with the right password', async () => {
      prisma.patient.findUnique.mockResolvedValue(PATIENT);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.loginPatient(PATIENT.email, 'correct');

      expect(result.accessToken).toBe('signed-token');
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
      jwtService.verify.mockReturnValue({ sub: CLINICIAN.id, role: UserRole.CLINICIAN, type: 'refresh' });
      prisma.clinician.findUnique.mockResolvedValue(null);

      await expect(service.refreshAccessToken('token')).rejects.toThrow(UnauthorizedException);
    });

    it('issues a new access + refresh token pair for a valid refresh token', async () => {
      jwtService.verify.mockReturnValue({ sub: CLINICIAN.id, role: UserRole.CLINICIAN, type: 'refresh' });
      prisma.clinician.findUnique.mockResolvedValue(CLINICIAN);

      const result = await service.refreshAccessToken('token');

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
    });
  });
});
