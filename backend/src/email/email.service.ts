import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { formatMoney, toText } from './email-layout';
import {
  type EmailContent,
  type OrderUpdateKind,
  activationEmail,
  accountClosedEmail,
  welcomeBackEmail,
  lapsedClosedEmail,
  lapsedEmail,
  checkInEmail,
  comeBackEmail,
  clinicianInviteEmail,
  consultationUpdateEmail,
  doseReminderEmail,
  leadReminderEmail,
  orderUpdateEmail,
  partnerOrderEmail,
  passwordChangedEmail,
  passwordResetEmail,
  paymentFailedEmail,
  paymentReceiptEmail,
  referralRewardEmail,
  refundAwaitingReturnEmail,
  refundEmail,
  staffAlertEmail,
  shopOrderEmail,
  type ShopOrderEmail,
  supplyPaymentEmail,
  verificationCodeEmail,
} from './templates';

interface Message extends EmailContent {
  /** What sort of email this is, for the logs: a subject can hold a code or a medicine name. */
  kind: string;
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
      this.logger.error(`Email (${message.kind}) to ${[message.to].flat().join(', ')} failed: ${error.message}`);
      return error.message;
    }
    return null;
  }

  async sendWelcomeBackEmail(to: string, firstName: string, a: { signInUrl: string; resetUrl: string; idCheckNeeded: boolean }) {
    if (!this.resend) {
      this.logger.log(`[DEV] Welcome back email to ${to}: ${a.signInUrl}`);
      return;
    }
    await this.deliver({ to, kind: 'welcome-back', ...welcomeBackEmail({ firstName, ...a }) });
  }

  async sendActivationEmail(to: string, firstName: string, activationUrl: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Activation email to ${to}: ${activationUrl}`);
      return;
    }
    await this.deliver({ to, kind: 'activation', ...activationEmail({ firstName, activationUrl }) });
  }

  /** Resolves true only once the provider has accepted it. */
  async sendClinicianInviteEmail(to: string, firstName: string, inviteUrl: string, firstTime: boolean): Promise<boolean> {
    if (!this.resend) {
      // Not a real send: the caller must not treat this as delivered.
      this.logger.log(`[DEV] Clinician invitation to ${to}: ${inviteUrl}`);
      return false;
    }
    return !(await this.deliver({ to, kind: 'clinician-invite', ...clinicianInviteEmail({ firstName, inviteUrl, firstTime }) }));
  }

  /** Resolves true only once the provider has accepted it. */
  async sendPasswordResetEmail(to: string, firstName: string, resetUrl: string, audience: 'patient' | 'staff', expiresInMinutes: number): Promise<boolean> {
    if (!this.resend) {
      this.logger.log(`[DEV] Password reset for ${to}: ${resetUrl}`);
      return false;
    }
    return !(await this.deliver({ to, kind: 'password-reset', ...passwordResetEmail({ firstName, resetUrl, audience, expiresInMinutes }) }));
  }

  async sendPasswordChangedEmail(to: string, firstName: string, audience: 'patient' | 'staff'): Promise<boolean> {
    if (!this.resend) {
      this.logger.log(`[DEV] Password changed notice to ${to}`);
      return false;
    }
    return !(await this.deliver({ to, kind: 'password-changed', ...passwordChangedEmail({ firstName, audience }) }));
  }

  async sendVerificationCodeEmail(to: string, code: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Verification code for ${to}: ${code}`);
      return;
    }
    const failure = await this.deliver({ to, kind: 'verification-code', ...verificationCodeEmail({ code }) });
    if (failure) {
      // While developing, the code goes to the log so the flow can still be tried; never in production.
      if (this.config.get<string>('NODE_ENV') !== 'production') this.logger.warn(`[DEV] The mail provider refused the email (${failure}). Verification code for ${to}: ${code}`);
      // Thrown, unlike the other emails: the visitor must not be told a code was sent when none was.
      throw new Error(failure);
    }
  }

  /** The shop's emails to a buyer: paid, sent, refunded. */
  async sendShopOrderEmail(to: string, firstName: string, order: ShopOrderEmail) {
    if (!this.resend) {
      this.logger.log(`[DEV] Shop order email (${order.kind}) to ${to}: ${order.reference}`);
      return;
    }
    await this.deliver({ to, kind: `shop-order-${order.kind.toLowerCase()}`, ...shopOrderEmail({ firstName, ...order }) });
  }

  async sendPaymentReceiptEmail(to: string, firstName: string, payment: { amount: number; currency: string; paidAt: Date; reference?: string | null }) {
    if (!this.resend) {
      this.logger.log(`[DEV] Payment receipt email to ${to}: ${formatMoney(payment.amount, payment.currency)}`);
      return;
    }
    await this.deliver({ to, kind: 'payment-receipt', ...paymentReceiptEmail({ firstName, ...payment }) });
  }

  async sendRefundEmail(to: string, firstName: string | null | undefined, refund: { amount: number; currency: string }) {
    if (!this.resend) {
      this.logger.log(`[DEV] Refund email to ${to}: ${formatMoney(refund.amount, refund.currency)}`);
      return;
    }
    await this.deliver({ to, kind: 'refund', ...refundEmail({ firstName, ...refund }) });
  }

  async sendSupplyPaymentEmail(to: string, firstName: string, a: { amount: number; currency: string; payUrl: string; reminder?: boolean }) {
    if (!this.resend) {
      this.logger.log(`[DEV] Supply payment${a.reminder ? ' reminder' : ''} email to ${to}: ${formatMoney(a.amount, a.currency)} ${a.payUrl}`);
      return;
    }
    await this.deliver({ to, kind: a.reminder ? 'supply-payment-reminder' : 'supply-payment', ...supplyPaymentEmail({ firstName, ...a }) });
  }

  async sendPaymentFailedEmail(to: string, firstName: string, settingsUrl: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Payment failed email to ${to}: ${settingsUrl}`);
      return;
    }
    await this.deliver({ to, kind: 'payment-failed', ...paymentFailedEmail({ firstName, settingsUrl }) });
  }

  async sendRefundAwaitingReturnEmail(to: string, firstName: string | null | undefined) {
    if (!this.resend) {
      this.logger.log(`[DEV] Refund awaiting return email to ${to}`);
      return;
    }
    await this.deliver({ to, kind: 'refund-awaiting-return', ...refundAwaitingReturnEmail({ firstName }) });
  }

  async sendComeBackEmail(to: string, firstName: string, a: { amount: number; currency: string; payUrl: string; until: string }) {
    if (!this.resend) {
      this.logger.log(`[DEV] Come-back email to ${to}: ${formatMoney(a.amount, a.currency)} until ${a.until} ${a.payUrl}`);
      return;
    }
    await this.deliver({ to, kind: 'come-back', ...comeBackEmail({ firstName, ...a }) });
  }

  async sendLapsedEmail(to: string, firstName: string, a: { month: number; of: number; portalUrl: string; closesOn: string }) {
    if (!this.resend) {
      this.logger.log(`[DEV] Lapsed email ${a.month}/${a.of} to ${to}`);
      return;
    }
    await this.deliver({ to, kind: 'lapsed', ...lapsedEmail({ firstName, ...a }) });
  }

  async sendLapsedClosedEmail(to: string, firstName: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Lapsed account closed email to ${to}`);
      return;
    }
    await this.deliver({ to, kind: 'lapsed-closed', ...lapsedClosedEmail({ firstName }) });
  }

  async sendAccountClosedEmail(to: string, firstName: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Account closed email to ${to}`);
      return;
    }
    await this.deliver({ to, kind: 'account-closed', ...accountClosedEmail({ firstName }) });
  }

  async sendCheckInEmail(to: string, firstName: string, checkInUrl: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Check-in email to ${to}: ${checkInUrl}`);
      return;
    }
    await this.deliver({ to, kind: 'check-in', ...checkInEmail({ firstName, checkInUrl }) });
  }

  /** Resolves true only once the provider has accepted it (never in development, where nothing is sent). */
  async sendLeadReminderEmail(to: string, firstName: string, continueUrl: string, unsubscribeUrl: string, last: boolean): Promise<boolean> {
    if (!this.resend) {
      this.logger.log(`[DEV] Lead reminder${last ? ' (last)' : ''} to ${to}: ${continueUrl}`);
      return false;
    }
    return !(await this.deliver({ to, kind: 'lead-reminder', ...leadReminderEmail({ firstName, continueUrl, unsubscribeUrl, last }) }));
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
    await this.deliver({ to, kind: 'order-update', ...orderUpdateEmail({ firstName, kind, ...details }) });
  }

  /** Resolves true only once the provider has confirmed it accepted the send. */
  async sendDoseReminderEmail(to: string, firstName: string, productName: string, scheduledFor: Date, portalUrl: string): Promise<boolean> {
    if (!this.resend) {
      // Not a real send — the caller must not treat this as delivered.
      this.logger.log(`[DEV] Dose reminder email to ${to}: ${productName} due ${scheduledFor.toISOString()}`);
      return false;
    }
    return !(await this.deliver({ to, kind: 'dose-reminder', ...doseReminderEmail({ firstName, productName, scheduledFor, portalUrl }) }));
  }

  async sendConsultationUpdateEmail(to: string, firstName: string, headline: string, portalUrl: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Consultation update email to ${to}: ${headline}`);
      return;
    }
    await this.deliver({ to, kind: 'consultation-update', ...consultationUpdateEmail({ firstName, headline, portalUrl }) });
  }

  /**
   * The one nudge for a message from the care team still unread. Resolves true only once the provider has accepted it,
   * so the caller can try again later when it has not (including when no provider is configured).
   */
  async sendUnreadMessageEmail(to: string, firstName: string, messagesUrl: string): Promise<boolean> {
    const headline = 'You have an unread message from your care team';
    if (!this.resend) {
      this.logger.log(`[DEV] Unread message email to ${to}: ${headline}`);
      return false;
    }
    return !(await this.deliver({ to, kind: 'unread-message', ...consultationUpdateEmail({ firstName, headline, portalUrl: messagesUrl }) }));
  }

  async sendReferralRewardEmail(to: string, firstName: string, amountLabel: string, autoApplied: boolean, rewardsUrl?: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Referral reward email to ${to}: ${amountLabel} (autoApplied=${autoApplied})`);
      return;
    }
    await this.deliver({ to, kind: 'referral-reward', ...referralRewardEmail({ firstName, amountLabel, autoApplied, rewardsUrl }) });
  }

  /** Tells a staff member something urgent is waiting. Names no patient (see staffAlertEmail). */
  async sendStaffAlertEmail(to: string, firstName: string, headline: string, portalUrl: string) {
    if (!this.resend) {
      this.logger.log(`[DEV] Staff alert email to ${to}: ${headline}`);
      return;
    }
    await this.deliver({ to, kind: 'staff-alert', ...staffAlertEmail({ firstName, headline, portalUrl }) });
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
      kind: 'partner-order',
      ...partnerOrderEmail({ subject, html }),
      ...(attachment ? { attachments: [{ filename: attachment.filename, content: Buffer.from(attachment.json, 'utf8') }] } : {}),
    });
    return !failure;
  }
}
