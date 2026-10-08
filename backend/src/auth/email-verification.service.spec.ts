import { BadRequestException, HttpException } from '@nestjs/common';
import { CODE_TTL_MS, EmailVerificationService, MAX_CODES_PER_HOUR, MAX_WRONG_CODES, RESEND_COOLDOWN_MS, TOKEN_TTL_MS } from './email-verification.service';

// An in-memory stand-in for the one table the service uses: one row per email, like the real table.
function setup(env: Record<string, string> = {}) {
  const rows = new Map<string, any>();
  const prisma: any = {
    emailVerification: {
      findUnique: jest.fn(async ({ where }: any) => (rows.has(where.email) ? { ...rows.get(where.email) } : null)),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        rows.set(where.email, rows.has(where.email) ? { ...rows.get(where.email), ...update } : { ...create });
        return rows.get(where.email);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const next = { ...rows.get(where.email) };
        for (const [k, v] of Object.entries<any>(data)) next[k] = v && typeof v === 'object' && 'increment' in v ? next[k] + v.increment : v;
        rows.set(where.email, next);
        return next;
      }),
    },
  };
  const email = { sendVerificationCodeEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new EmailVerificationService(prisma, email as any, { get: (k: string) => env[k] } as any);
  const sentCode = () => email.sendVerificationCodeEmail.mock.calls.at(-1)![1] as string;
  return { service, email, prisma, sentCode, row: () => rows.get('anna@example.com') };
}

const T0 = new Date('2026-10-08T10:00:00Z');
const after = (ms: number) => new Date(T0.getTime() + ms);

describe('EmailVerificationService', () => {
  it('emails a six-digit code to the lower-cased address, and keeps only a hash of it', async () => {
    const { service, email, sentCode, row } = setup();
    await service.requestCode('  Anna@Example.com ', T0);
    expect(email.sendVerificationCodeEmail).toHaveBeenCalledWith('anna@example.com', expect.stringMatching(/^\d{6}$/));
    expect(JSON.stringify(row())).not.toContain(sentCode());
  });

  it('refuses something that isn’t an email address', async () => {
    const { service, email } = setup();
    await expect(service.requestCode('not an email', T0)).rejects.toThrow(BadRequestException);
    expect(email.sendVerificationCodeEmail).not.toHaveBeenCalled();
  });

  it('waits between codes, and caps how many one address can be sent in an hour', async () => {
    const { service } = setup();
    await service.requestCode('a@b.com', T0);
    await expect(service.requestCode('a@b.com', after(RESEND_COOLDOWN_MS - 1))).rejects.toThrow(HttpException);
    for (let i = 1; i < MAX_CODES_PER_HOUR; i++) await service.requestCode('a@b.com', after(i * RESEND_COOLDOWN_MS + i));
    await expect(service.requestCode('a@b.com', after(MAX_CODES_PER_HOUR * RESEND_COOLDOWN_MS + 10))).rejects.toThrow(/Too many codes/);
    // Past the hour the count starts again.
    await expect(service.requestCode('a@b.com', after(61 * 60_000))).resolves.toBeUndefined();
  });

  it('gives the proof for the right code, once, and the proof then stands for the address', async () => {
    const { service, sentCode } = setup();
    await service.requestCode('a@b.com', T0);
    const token = await service.verifyCode('A@b.com', ` ${sentCode()} `, after(60_000));
    await expect(service.assertVerified('a@b.com', token, after(120_000))).resolves.toBeUndefined();
    // The same code can't be used again.
    await expect(service.verifyCode('a@b.com', sentCode(), after(130_000))).rejects.toThrow(/expired/);
  });

  it('rejects a wrong code, and gives up on the code after too many wrong ones', async () => {
    const { service, sentCode } = setup();
    await service.requestCode('a@b.com', T0);
    const wrong = sentCode() === '000000' ? '111111' : '000000';
    for (let i = 0; i < MAX_WRONG_CODES; i++) await expect(service.verifyCode('a@b.com', wrong, after(1000))).rejects.toThrow(/isn’t right/);
    // Even the right code no longer works: a new one has to be asked for.
    await expect(service.verifyCode('a@b.com', sentCode(), after(2000))).rejects.toThrow(/Too many wrong codes/);
  });

  it('rejects an expired code and an address nobody asked a code for', async () => {
    const { service, sentCode } = setup();
    await expect(service.verifyCode('nobody@b.com', '123456', T0)).rejects.toThrow(/expired/);
    await service.requestCode('a@b.com', T0);
    await expect(service.verifyCode('a@b.com', sentCode(), after(CODE_TTL_MS + 1))).rejects.toThrow(/expired/);
  });

  it('only accepts the proof for the address it was given for, and only for a while', async () => {
    const { service, sentCode } = setup();
    await service.requestCode('a@b.com', T0);
    const token = await service.verifyCode('a@b.com', sentCode(), after(1000));
    await expect(service.assertVerified('other@b.com', token, after(2000))).rejects.toThrow(/verify your email/);
    await expect(service.assertVerified('a@b.com', 'forged', after(2000))).rejects.toThrow(/verify your email/);
    await expect(service.assertVerified('a@b.com', undefined, after(2000))).rejects.toThrow(/verify your email/);
    await expect(service.assertVerified('a@b.com', token, after(1000 + TOKEN_TTL_MS + 1))).rejects.toThrow(/verify your email/);
  });

  it('a new code cancels the proof from the one before', async () => {
    const { service, sentCode } = setup();
    await service.requestCode('a@b.com', T0);
    const token = await service.verifyCode('a@b.com', sentCode(), after(1000));
    await service.requestCode('a@b.com', after(RESEND_COOLDOWN_MS + 5000));
    await expect(service.assertVerified('a@b.com', token, after(RESEND_COOLDOWN_MS + 6000))).rejects.toThrow(/verify your email/);
  });

  it('can be switched off for local development, but never in production', async () => {
    await expect(setup({ DISABLE_EMAIL_VERIFICATION: 'true' }).service.assertVerified('a@b.com', undefined)).resolves.toBeUndefined();
    await expect(setup({ DISABLE_EMAIL_VERIFICATION: 'true', NODE_ENV: 'production' }).service.assertVerified('a@b.com', undefined)).rejects.toThrow(/verify your email/);
  });

  it('reports a failed email as a problem to try again, not as a sent code', async () => {
    const { service, email } = setup();
    email.sendVerificationCodeEmail.mockRejectedValue(new Error('resend down'));
    await expect(service.requestCode('a@b.com', T0)).rejects.toThrow(/couldn’t send the code/);
  });
});
