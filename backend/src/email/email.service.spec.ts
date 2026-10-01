import { EmailService } from './email.service';

const send = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
}));

function makeConfig(values: Record<string, string> = {}) {
  return { get: jest.fn((key: string) => values[key]) };
}

describe('EmailService.sendDoseReminderEmail', () => {
  beforeEach(() => send.mockReset());

  it('returns false and never calls the provider when no API key is configured (dev/log-only)', async () => {
    const service = new EmailService(makeConfig() as any);
    const delivered = await service.sendDoseReminderEmail('p@example.com', 'Tia', 'Semaglutide', new Date('2026-10-05'), 'https://app/doses');
    expect(delivered).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns true once the provider confirms acceptance', async () => {
    send.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const service = new EmailService(makeConfig({ RESEND_API_KEY: 'key' }) as any);
    const delivered = await service.sendDoseReminderEmail('p@example.com', 'Tia', 'Semaglutide', new Date('2026-10-05'), 'https://app/doses');
    expect(delivered).toBe(true);
  });

  it('returns false when the provider reports an error, without throwing', async () => {
    send.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'Invalid `to` field' } });
    const service = new EmailService(makeConfig({ RESEND_API_KEY: 'key' }) as any);
    const delivered = await service.sendDoseReminderEmail('p@example.com', 'Tia', 'Semaglutide', new Date('2026-10-05'), 'https://app/doses');
    expect(delivered).toBe(false);
  });

  it('HTML-escapes the patient name and product name', async () => {
    send.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const service = new EmailService(makeConfig({ RESEND_API_KEY: 'key' }) as any);
    await service.sendDoseReminderEmail('p@example.com', '<img src=x onerror=alert(1)>', 'Sema"<script>', new Date('2026-10-05'), 'https://app/doses');

    const html = send.mock.calls[0][0].html;
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
