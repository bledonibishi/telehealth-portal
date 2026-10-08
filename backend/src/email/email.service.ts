import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

// Patient-supplied text (names) gets interpolated straight into HTML emails —
// escape it so a name like `<img src=x onerror=...>` can't inject markup.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private from: string;

  constructor(private config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn('RESEND_API_KEY not set — emails will be logged only');
    }
    this.from = config.get<string>('EMAIL_FROM') ?? 'noreply@telehealth.dev';
  }

  async sendActivationEmail(to: string, firstName: string, activationUrl: string) {
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#1e293b">Welcome, ${firstName}!</h2>
        <p style="color:#475569">Your payment was successful. Click the button below to activate your account and access your patient portal.</p>
        <a href="${activationUrl}"
          style="display:inline-block;margin:24px 0;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Activate my account
        </a>
        <p style="color:#94a3b8;font-size:13px">This link expires in 7 days. If you didn't sign up, you can ignore this email.</p>
      </div>
    `;

    if (!this.resend) {
      this.logger.log(`[DEV] Activation email to ${to}: ${activationUrl}`);
      return;
    }

    await this.resend.emails.send({ from: this.from, to, subject: 'Activate your account', html });
  }

  async sendCheckInEmail(to: string, firstName: string, checkInUrl: string) {
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#1e293b">Time for your check-in, ${firstName}</h2>
        <p style="color:#475569">Share your weight and how you’re feeling — it takes about 2 minutes, and helps us keep your treatment on track.</p>
        <a href="${checkInUrl}"
          style="display:inline-block;margin:24px 0;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Start my check-in
        </a>
        <p style="color:#94a3b8;font-size:13px">This link is personal to you and expires in 14 days.</p>
      </div>
    `;

    if (!this.resend) {
      this.logger.log(`[DEV] Check-in email to ${to}: ${checkInUrl}`);
      return;
    }

    await this.resend.emails.send({ from: this.from, to, subject: 'Your check-in is ready', html });
  }

  /**
   * Tells a patient their order has moved. Deliberately generic about the medicine: email isn't a secure
   * channel, so the detail stays in the portal.
   */
  async sendOrderUpdateEmail(
    to: string,
    firstName: string,
    kind: 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED',
    details: { carrier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null; expected?: string | null; ordersUrl: string },
  ) {
    const copy = {
      SHIPPED: { subject: 'Your order is on its way', title: 'Your order is on its way', body: 'Your pharmacy has packed your order and handed it to the courier.' },
      OUT_FOR_DELIVERY: { subject: 'Your order is out for delivery', title: 'Out for delivery today', body: 'The courier has your order and is on the way to you.' },
      DELIVERY_FAILED: { subject: 'We couldn’t deliver your order today', title: 'We couldn’t deliver today', body: 'The courier wasn’t able to hand over your order. They will usually try again; if you won’t be home, message your care team from the portal and we’ll help.' },
      DELIVERED: { subject: 'Your order has been delivered', title: 'Your order has arrived', body: 'Your order has been delivered. If you can’t find it, message your care team from the portal.' },
    }[kind];
    const safeName = escapeHtml(firstName);
    const lines: string[] = [];
    if (kind !== 'DELIVERED' && kind !== 'DELIVERY_FAILED' && details.expected) lines.push(`Expected delivery: <b>${escapeHtml(details.expected)}</b>`);
    if (kind !== 'DELIVERED' && details.carrier) lines.push(`Courier: ${escapeHtml(details.carrier)}`);
    if (kind !== 'DELIVERED' && details.trackingNumber) lines.push(`Tracking number: ${escapeHtml(details.trackingNumber)}`);
    const track =
      kind !== 'DELIVERED' && details.trackingUrl
        ? `<p><a href="${escapeHtml(details.trackingUrl)}" style="color:#2563eb">Track your parcel</a></p>`
        : '';
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#1e293b">${copy.title}, ${safeName}</h2>
        <p style="color:#475569">${copy.body}</p>
        ${lines.length ? `<p style="color:#475569;line-height:1.7">${lines.join('<br>')}</p>` : ''}
        ${track}
        <a href="${escapeHtml(details.ordersUrl)}"
          style="display:inline-block;margin:24px 0;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          View my order
        </a>
      </div>
    `;

    if (!this.resend) {
      this.logger.log(`[DEV] Order ${kind} email to ${to}${details.expected ? ` (expected ${details.expected})` : ''}${details.trackingNumber ? ` · tracking ${details.trackingNumber}` : ''}`);
      return;
    }
    await this.resend.emails.send({ from: this.from, to, subject: copy.subject, html });
  }

  /** Resolves true only once the provider has confirmed it accepted the send. */
  async sendDoseReminderEmail(to: string, firstName: string, productName: string, scheduledFor: Date, portalUrl: string): Promise<boolean> {
    const when = scheduledFor.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const safeFirstName = escapeHtml(firstName);
    const safeProductName = escapeHtml(productName);
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#1e293b">Upcoming dose reminder</h2>
        <p style="color:#475569">Hi ${safeFirstName}, your next dose of ${safeProductName} is due on ${when}.</p>
        <a href="${portalUrl}"
          style="display:inline-block;margin:24px 0;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          View my dose calendar
        </a>
        <p style="color:#94a3b8;font-size:13px">You can mark it as taken or skipped from your portal once it's done.</p>
      </div>
    `;

    if (!this.resend) {
      // Not a real send — the caller must not treat this as delivered.
      this.logger.log(`[DEV] Dose reminder email to ${to}: ${productName} due ${scheduledFor.toISOString()}`);
      return false;
    }

    const { error } = await this.resend.emails.send({ from: this.from, to, subject: `Reminder: ${productName} dose due ${when}`, html });
    if (error) {
      this.logger.error(`Dose reminder email to ${to} failed: ${error.message}`);
      return false;
    }
    return true;
  }

  // Deliberately generic: email isn't a secure channel, so the clinical detail
  // (decision, reasons, messages) stays behind the portal login.
  async sendConsultationUpdateEmail(to: string, firstName: string, headline: string, portalUrl: string) {
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#1e293b">${headline}</h2>
        <p style="color:#475569">Hi ${firstName}, there's an update from our clinical team. Log in to your patient portal to see it.</p>
        <a href="${portalUrl}"
          style="display:inline-block;margin:24px 0;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Open my portal
        </a>
      </div>
    `;

    if (!this.resend) {
      this.logger.log(`[DEV] Consultation update email to ${to}: ${headline}`);
      return;
    }

    await this.resend.emails.send({ from: this.from, to, subject: headline, html });
  }

  async sendReferralRewardEmail(to: string, firstName: string, amountLabel: string, autoApplied: boolean) {
    const safeFirstName = escapeHtml(firstName);
    const body = autoApplied
      ? `${amountLabel} has already been credited to your account, and will come off your next bill automatically.`
      : `${amountLabel} is ready for you to apply whenever you like — just visit your Rewards page and hit "Apply now".`;
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#1e293b">A friend you referred just joined!</h2>
        <p style="color:#475569">Hi ${safeFirstName}, your friend's first payment just went through — thanks for spreading the word.</p>
        <p style="color:#475569">${body}</p>
      </div>
    `;

    if (!this.resend) {
      this.logger.log(`[DEV] Referral reward email to ${to}: ${amountLabel} (autoApplied=${autoApplied})`);
      return;
    }

    await this.resend.emails.send({ from: this.from, to, subject: 'Your referral reward is ready', html });
  }

  /**
   * Sends a short notice about an order to the pharmacy partner (no patient details).
   * Returns false — instead of pretending — when no email provider is configured.
   */
  async sendPartnerOrderEmail(to: string[], subject: string, html: string, attachment?: { json: string; filename: string }): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn(`[DEV] Partner order email "${subject}" to ${to.join(', ')} not sent — RESEND_API_KEY is not set`);
      return false;
    }
    await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html,
      ...(attachment ? { attachments: [{ filename: attachment.filename, content: Buffer.from(attachment.json, 'utf8') }] } : {}),
    });
    return true;
  }
}
