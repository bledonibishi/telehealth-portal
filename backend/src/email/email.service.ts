import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { formatMoney, toText } from './email-layout';
import {
  type EmailContent,
  type OrderUpdateKind,
  activationEmail,
  checkInEmail,
  clinicianInviteEmail,
  consultationUpdateEmail,
  doseReminderEmail,
  orderUpdateEmail,
  partnerOrderEmail,
  paymentReceiptEmail,
  referralRewardEmail,
  refundEmail,
  verificationCodeEmail,
} from './templates';

interface Message extends EmailContent {
  to: string | string[];
  attachments?: Array<{ filename: string; content: Buffer }>;
}

/**
 * Sends the platform's emails. What each email says and looks like lives in ./templates (one file per email, built
 * from the pieces in email-layout.ts); this class decides when to send, and does the sending and the logging.
 * Without RESEND_API_KEY nothing is sent: the email is logged instead and the methods that report delivery say false.
 */
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

  /**
   * The one place an email leaves the platform. The provider reports a failure (a bad key, a refused address) as a
   * returned error and not a throw, so it is looked at here: null once the provider has accepted the email, otherwise its error message.
   */
  private async deliver(message: Message): Promise<string | null> {
    const { error } = await this.resend!.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: toText(message.html),
      ...(message.attachments ? { attachments: message.attachments } : {}),
    });
    if (error) {
      this.logger.error(`Email "${message.subject}" to ${[message.to].flat().join(', ')} failed: ${error.message}`);
      return error.message;
    }
    return null;
  }

  async sendActivationEmail(to: string, firstName: string, activationUrl: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Activation email to ${to}: ${activationUrl}`);
      return;
    }
    await this.deliver({ to, ...activationEmail({ firstName, activationUrl }) });
  }

  /** Resolves true only once the provider has accepted it. */
  async sendClinicianInviteEmail(to: string, firstName: string, inviteUrl: string, firstTime: boolean): Promise<boolean> {
    if (!this.resend) {
      // Not a real send: the caller must not treat this as delivered.
      this.logger.log(`[DEV] Clinician invitation to ${to}: ${inviteUrl}`);
      return false;
    }
    return !(await this.deliver({ to, ...clinicianInviteEmail({ firstName, inviteUrl, firstTime }) }));
  }

  async sendVerificationCodeEmail(to: string, code: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Verification code for ${to}: ${code}`);
      return;
    }
    const failure = await this.deliver({ to, ...verificationCodeEmail({ code }) });
    if (failure) {
      // While developing, the code goes to the log so the flow can still be tried; never in production.
      if (this.config.get<string>('NODE_ENV') !== 'production') this.logger.warn(`[DEV] The mail provider refused the email (${failure}). Verification code for ${to}: ${code}`);
      // Thrown, unlike the other emails: the visitor must not be told a code was sent when none was.
      throw new Error(failure);
    }
  }

  async sendPaymentReceiptEmail(to: string, firstName: string, payment: { amount: number; currency: string; paidAt: Date; reference?: string | null }) {
    if (!this.resend) {
      this.logger.log(`[DEV] Payment receipt email to ${to}: ${formatMoney(payment.amount, payment.currency)}`);
      return;
    }
    await this.deliver({ to, ...paymentReceiptEmail({ firstName, ...payment }) });
  }

  async sendRefundEmail(to: string, firstName: string | null | undefined, refund: { amount: number; currency: string }) {
    if (!this.resend) {
      this.logger.log(`[DEV] Refund email to ${to}: ${formatMoney(refund.amount, refund.currency)}`);
      return;
    }
    await this.deliver({ to, ...refundEmail({ firstName, ...refund }) });
  }

  async sendCheckInEmail(to: string, firstName: string, checkInUrl: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Check-in email to ${to}: ${checkInUrl}`);
      return;
    }
    await this.deliver({ to, ...checkInEmail({ firstName, checkInUrl }) });
  }

  async sendOrderUpdateEmail(
    to: string,
    firstName: string,
    kind: OrderUpdateKind,
    details: { carrier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null; expected?: string | null; ordersUrl: string },
  ) {
    if (!this.resend) {
      this.logger.log(`[DEV] Order ${kind} email to ${to}${details.expected ? ` (expected ${details.expected})` : ''}${details.trackingNumber ? ` · tracking ${details.trackingNumber}` : ''}`);
      return;
    }
    await this.deliver({ to, ...orderUpdateEmail({ firstName, kind, ...details }) });
  }

  /** Resolves true only once the provider has confirmed it accepted the send. */
  async sendDoseReminderEmail(to: string, firstName: string, productName: string, scheduledFor: Date, portalUrl: string): Promise<boolean> {
    if (!this.resend) {
      // Not a real send — the caller must not treat this as delivered.
      this.logger.log(`[DEV] Dose reminder email to ${to}: ${productName} due ${scheduledFor.toISOString()}`);
      return false;
    }
    return !(await this.deliver({ to, ...doseReminderEmail({ firstName, productName, scheduledFor, portalUrl }) }));
  }

  async sendConsultationUpdateEmail(to: string, firstName: string, headline: string, portalUrl: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Consultation update email to ${to}: ${headline}`);
      return;
    }
    await this.deliver({ to, ...consultationUpdateEmail({ firstName, headline, portalUrl }) });
  }

  async sendReferralRewardEmail(to: string, firstName: string, amountLabel: string, autoApplied: boolean, rewardsUrl?: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Referral reward email to ${to}: ${amountLabel} (autoApplied=${autoApplied})`);
      return;
    }
    await this.deliver({ to, ...referralRewardEmail({ firstName, amountLabel, autoApplied, rewardsUrl }) });
  }

  /**
   * Sends a short notice about an order to the pharmacy partner (no patient details). Returns false — instead of
   * pretending — when no email provider is configured or the provider refused it.
   */
  async sendPartnerOrderEmail(to: string[], subject: string, html: string, attachment?: { json: string; filename: string }): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn(`[DEV] Partner order email "${subject}" to ${to.join(', ')} not sent — RESEND_API_KEY is not set`);
      return false;
    }
    const failure = await this.deliver({
      to,
      ...partnerOrderEmail({ subject, html }),
      ...(attachment ? { attachments: [{ filename: attachment.filename, content: Buffer.from(attachment.json, 'utf8') }] } : {}),
    });
    return !failure;
  }
}
