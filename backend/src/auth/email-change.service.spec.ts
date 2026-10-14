import * as bcrypt from 'bcryptjs';
import { EmailChangeService } from './email-change.service';

describe('EmailChangeService', () => {
  const hash = bcrypt.hashSync('Right-pass-1', 4);
  let prisma: any, audit: any, email: any, verification: any, auth: any, service: EmailChangeService;
  const patient = { id: 'p1', email: 'old@example.com', firstName: 'Ana', passwordHash: hash, tokenVersion: 2 };

  beforeEach(() => {
    prisma = {
      patient: { findUnique: jest.fn().mockResolvedValue(patient), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      clinician: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    audit = { log: jest.fn() };
    email = { sendEmailChangedEmail: jest.fn() };
    verification = { requestCode: jest.fn(), verifyCode: jest.fn() };
    auth = { issueTokens: jest.fn().mockReturnValue({ accessToken: 'a', refreshToken: 'r' }) };
    service = new EmailChangeService(prisma, audit, email, verification, auth);
  });

  it('refuses a wrong password without sending a code', async () => {
    await expect(service.request('p1', 'new@example.com', 'nope')).rejects.toThrow('current password');
    expect(verification.requestCode).not.toHaveBeenCalled();
  });

  it('sends the code to the new, lower-cased address', async () => {
    prisma.patient.findUnique.mockResolvedValueOnce(patient).mockResolvedValueOnce(null);
    await service.request('p1', ' New@Example.com ', 'Right-pass-1');
    expect(verification.requestCode).toHaveBeenCalledWith('new@example.com');
  });

  it('refuses an address that already has an account', async () => {
    prisma.patient.findUnique.mockResolvedValueOnce(patient).mockResolvedValueOnce({ id: 'other' });
    await expect(service.request('p1', 'taken@example.com', 'Right-pass-1')).rejects.toThrow();
    expect(verification.requestCode).not.toHaveBeenCalled();
  });

  it('changes the address, ends other sessions, tells the old inbox and returns fresh tokens', async () => {
    prisma.patient.findUnique.mockResolvedValueOnce(patient).mockResolvedValueOnce(null);
    const tokens = await service.confirm('p1', 'new@example.com', '123456');
    expect(verification.verifyCode).toHaveBeenCalledWith('new@example.com', '123456');
    expect(prisma.patient.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { email: 'new@example.com', tokenVersion: { increment: 1 } } }));
    expect(email.sendEmailChangedEmail).toHaveBeenCalledWith('old@example.com', 'Ana', 'new@example.com');
    expect(auth.issueTokens).toHaveBeenCalledWith('p1', 'PATIENT', 3);
    expect(tokens.accessToken).toBe('a');
  });

  it('changes nothing when the code is wrong', async () => {
    prisma.patient.findUnique.mockResolvedValueOnce(patient).mockResolvedValueOnce(null);
    verification.verifyCode.mockRejectedValue(new Error('bad code'));
    await expect(service.confirm('p1', 'new@example.com', '000000')).rejects.toThrow('bad code');
    expect(prisma.patient.updateMany).not.toHaveBeenCalled();
  });
});
