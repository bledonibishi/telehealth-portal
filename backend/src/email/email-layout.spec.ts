import { button, emailLayout, heading, toText } from './email-layout';
import { EmailService } from './email.service';

const send = jest.fn();
jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send } })) }));
const config = { get: (k: string) => ({ RESEND_API_KEY: 'key' } as Record<string, string>)[k] };
const evil = '<img src=x onerror=alert(1)>';

describe('email layout', () => {
  it('escapes headings and button labels and links', () => {
    expect(heading(evil)).not.toContain('<img');
    const b = button('Go', 'https://x.test/?a="b"&c=<d>');
    expect(b).not.toContain('"b"');
    expect(b).toContain('&quot;b&quot;');
  });

  it('shows the brand and a footer that fits who it is for', () => {
    expect(emailLayout({ preheader: 'p', body: 'b' })).toContain('Omopharmacy');
    expect(emailLayout({ preheader: 'p', body: 'b' })).toContain('don’t reply');
    expect(emailLayout({ preheader: 'p', body: 'b', audience: 'staff' })).toContain('added you to the team');
    expect(emailLayout({ preheader: 'p', body: 'b', audience: 'partner' })).toContain('pharmacy partners');
  });

  it('makes a readable plain-text copy with the links kept', () => {
    const text = toText(emailLayout({ preheader: 'hidden preview', body: `${heading('Hello & welcome')}${button('Open', 'https://x.test/a?b=1&c=2')}` }));
    expect(text).toContain('Open (https://x.test/a?b=1&c=2)');
    expect(text).toContain('Hello & welcome');
    expect(text).not.toMatch(/<[a-z]/i);
    expect(text).not.toContain('hidden preview');
  });
});

describe('every email', () => {
  beforeEach(() => send.mockReset().mockResolvedValue({ data: { id: '1' }, error: null }));
  const s = () => new EmailService(config as any);

  it.each([
    ['activation', (e: EmailService) => e.sendActivationEmail('a@b.c', evil, 'https://x.test/a')],
    ['clinician invite', (e: EmailService) => e.sendClinicianInviteEmail('a@b.c', evil, 'https://x.test/a', true)],
    ['check-in', (e: EmailService) => e.sendCheckInEmail('a@b.c', evil, 'https://x.test/a')],
    ['order update', (e: EmailService) => e.sendOrderUpdateEmail('a@b.c', evil, 'SHIPPED', { carrier: evil, trackingNumber: evil, trackingUrl: 'https://x.test/t', expected: evil, ordersUrl: 'https://x.test/o' })],
    ['dose reminder', (e: EmailService) => e.sendDoseReminderEmail('a@b.c', evil, evil, new Date('2026-10-05'), 'https://x.test/d')],
    ['consultation update', (e: EmailService) => e.sendConsultationUpdateEmail('a@b.c', evil, evil, 'https://x.test/p')],
    ['payment receipt', (e: EmailService) => e.sendPaymentReceiptEmail('a@b.c', evil, { amount: 4200, currency: 'eur', paidAt: new Date('2026-10-05'), reference: evil })],
    ['refund', (e: EmailService) => e.sendRefundEmail('a@b.c', evil, { amount: 4200, currency: 'eur' })],
    ['referral reward', (e: EmailService) => e.sendReferralRewardEmail('a@b.c', evil, evil, true)],
  ])('%s: branded, plain-text copy, nothing typed can inject markup', async (_name, run) => {
    await run(s());
    const msg = send.mock.calls[0][0];
    expect(msg.html).toContain('Omopharmacy');
    expect(msg.html).not.toContain('<img');
    expect(msg.text).toBeTruthy();
    expect(msg.text).not.toMatch(/<(div|table|td|a |p>)/i);
  });

  it('partner orders are wrapped in the layout and report a refusal instead of success', async () => {
    expect(await s().sendPartnerOrderEmail(['p@x.test'], 'New order', '<p>hi</p>')).toBe(true);
    expect(send.mock.calls[0][0].html).toContain('pharmacy partners');
    send.mockResolvedValue({ data: null, error: { message: 'nope' } });
    expect(await s().sendPartnerOrderEmail(['p@x.test'], 'New order', '<p>hi</p>')).toBe(false);
  });
});

describe('money emails', () => {
  beforeEach(() => send.mockReset().mockResolvedValue({ data: { id: '1' }, error: null }));

  it('the receipt shows the amount as the patient reads it', async () => {
    await new EmailService(config as any).sendPaymentReceiptEmail('a@b.c', 'Tia', { amount: 4200, currency: 'eur', paidAt: new Date('2026-10-05') });
    expect(send.mock.calls[0][0].subject).toBe('Payment received — €42.00');
    expect(send.mock.calls[0][0].text).toContain('€42.00');
  });

  it('the refund email works without a first name', async () => {
    await new EmailService(config as any).sendRefundEmail('a@b.c', null, { amount: 2000, currency: 'eur' });
    expect(send.mock.calls[0][0].text).toContain('We’ve refunded your payment');
    expect(send.mock.calls[0][0].text).toContain('€20.00');
  });
});
