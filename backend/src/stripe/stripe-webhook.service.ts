import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);
  private appUrl: string;

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private config: ConfigService,
  ) {
    this.appUrl = config.get<string>('PATIENT_APP_URL') ?? 'http://localhost:3001';
  }

  async handle(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;
      default:
        this.logger.debug(`Unhandled event type: ${event.type}`);
    }
  }

  private async onCheckoutComplete(session: Stripe.Checkout.Session) {
    const email = session.customer_details?.email ?? (session.metadata?.email as string);
    if (!email) {
      this.logger.warn(`checkout.session.completed has no email — session ${session.id}`);
      return;
    }

    // Find the lead by email
    const lead = await this.prisma.lead.findUnique({ where: { email } });
    if (!lead) {
      this.logger.warn(`No lead found for email ${email} — session ${session.id}`);
      return;
    }

    // Idempotency: if already converted, skip
    if (lead.convertedAt) {
      this.logger.log(`Lead ${lead.id} already converted — skipping`);
      return;
    }

    // Generate activation token (expires 7 days)
    const activationToken = crypto.randomBytes(32).toString('hex');
    const activationTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create or update patient
    const tempPasswordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);

    const patient = await this.prisma.patient.upsert({
      where: { email },
      update: { activationToken, activationTokenExpiresAt },
      create: {
        email,
        passwordHash: tempPasswordHash,
        firstName: lead.firstName,
        lastName: lead.lastName,
        dateOfBirth: new Date('1990-01-01'), // placeholder — patient sets this on activation
        leadId: lead.id,
        activationToken,
        activationTokenExpiresAt,
      },
    });

    // Mark lead as converted with stripeSessionId
    await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        convertedAt: new Date(),
        stripeSessionId: session.id,
      },
    });

    this.logger.log(`Patient created/updated for ${email} — patient ${patient.id}`);

    // Send activation email
    const activationUrl = `${this.appUrl}/activate?token=${activationToken}`;
    await this.email.sendActivationEmail(email, lead.firstName, activationUrl);

    this.logger.log(`Activation email sent to ${email}`);
  }
}
