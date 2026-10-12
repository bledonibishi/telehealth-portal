import { EmailService } from './email.service';

function build(env: Record<string, string>, result: any) {
  const service = new EmailService({ get: (k: string) => env[k] } as any);
  const send = jest.fn().mockResolvedValue(result);
  (service as any).resend = { emails: { send } };
  const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
  return { service, send, warn };
}

describe('EmailService.sendVerificationCodeEmail', () => {
  it('sends the code to the address', async () => {
    const { service, send } = build({ RESEND_API_KEY: 're_x' }, { data: { id: 'e1' }, error: null });
    await service.sendVerificationCodeEmail('a@b.com', '123456');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com', subject: expect.stringContaining('123456') }));
  });

  it('fails when the mail provider returns an error (it does not throw one), so a code that never went out is not reported as sent', async () => {
    const { service } = build({ RESEND_API_KEY: 're_bad' }, { data: null, error: { name: 'validation_error', message: 'API key is invalid' } });
    await expect(service.sendVerificationCodeEmail('a@b.com', '123456')).rejects.toThrow('API key is invalid');
  });

  it('prints the code in the log while developing when the email could not be sent, but never in production', async () => {
    const dev = build({ RESEND_API_KEY: 're_bad' }, { data: null, error: { message: 'API key is invalid' } });
    await expect(dev.service.sendVerificationCodeEmail('a@b.com', '123456')).rejects.toThrow();
    expect(dev.warn).toHaveBeenCalledWith(expect.stringContaining('123456'));

    const prod = build({ RESEND_API_KEY: 're_bad', NODE_ENV: 'production' }, { data: null, error: { message: 'API key is invalid' } });
    await expect(prod.service.sendVerificationCodeEmail('a@b.com', '123456')).rejects.toThrow();
    expect(prod.warn).not.toHaveBeenCalledWith(expect.stringContaining('123456'));
  });
});
