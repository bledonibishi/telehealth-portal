import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

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
        <h2 style="color:#1e293b">Time for your monthly check-in, ${firstName}</h2>
        <p style="color:#475569">Let us know how your treatment is going so we can keep your prescription on track.</p>
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

    await this.resend.emails.send({ from: this.from, to, subject: 'Your monthly check-in is ready', html });
  }
}
