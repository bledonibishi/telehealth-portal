import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PostHogService } from '../posthog/posthog.service';
import { PostHogLoggerService } from '../posthog/posthog-logger.service';
import { VoucherKind, VoucherStatus } from '../common/enums';

const REFERRAL_REWARD_CENTS = 2000; // £20, both sides
const REWARD_CURRENCY = 'gbp';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);
  private stripe: Stripe;
  private webflowSiteUrl: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private email: EmailService,
    private posthog: PostHogService,
    private posthogLogger: PostHogLoggerService,
  ) {
    this.stripe = new Stripe(config.get<string>('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' as any });
    this.webflowSiteUrl = config.get<string>('WEBFLOW_SITE_URL', 'http://localhost:3000');
  }

  /** Returns the patient's own shareable code, generating one on first use. */
  async codeFor(patientId: string): Promise<string> {
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { referralCode: true } });
    if (patient.referralCode) return patient.referralCode;

    // Collisions are astronomically unlikely at this length, but retry rather
    // than trust that — the unique constraint is the real guarantee.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      try {
        await this.prisma.patient.update({ where: { id: patientId }, data: { referralCode: code } });
        return code;
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err;
      }
    }
    throw new Error('Could not generate a unique referral code');
  }

  /** The shareable link for a patient's own code (created on first use). */
  async referralLinkFor(patientId: string): Promise<string> {
    return this.linkFor(await this.codeFor(patientId));
  }

  private linkFor(code: string): string {
    return `${this.webflowSiteUrl}/?ref=${code}`;
  }

  /**
   * Called from LeadsService.upsert right after a brand-new lead is created.
   * Silently no-ops on an unknown code or a self-referral, so a bad/missing
   * code never blocks the lead from being created.
   */
  async validateAndAttach(code: string | null | undefined, lead: { id: string; email: string }): Promise<void> {
    if (!code) return;

    // One referral per lead: keep the first attribution rather than overwrite or error.
    if (await this.prisma.referral.findUnique({ where: { referredLeadId: lead.id }, select: { id: true } })) return;

    const referrer = await this.prisma.patient.findUnique({ where: { referralCode: code }, select: { id: true, email: true } });
    if (!referrer) {
      this.logger.warn(`Lead ${lead.id} carried an unknown referral code`);
      return;
    }
    if (referrer.email.toLowerCase() === lead.email.toLowerCase()) {
      this.logger.warn(`Lead ${lead.id} tried to self-refer with their own code`);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id: lead.id }, data: { referralCode: code } }),
      this.prisma.referral.create({
        data: { code, referrerId: referrer.id, referredLeadId: lead.id },
      }),
    ]);

    this.posthog.capture(referrer.id, 'referral_lead_attributed', { referred_lead_id: lead.id });
  }

  /**
   * Called from StripeWebhookService.activatePatient the first time a lead
   * converts into a Patient. Only fires rewards for a lead that actually paid.
   */
  async handleConversion(
    lead: { id: string },
    patient: { id: string; email: string; firstName: string },
    { friendRewardApplied = true }: { friendRewardApplied?: boolean } = {},
  ): Promise<void> {
    const referral = await this.prisma.referral.findUnique({ where: { referredLeadId: lead.id } });
    if (!referral || referral.status === 'CONVERTED') return;

    await this.prisma.referral.update({
      where: { id: referral.id },
      data: { status: 'CONVERTED', convertedAt: new Date(), referredPatientId: patient.id },
    });

    // The friend's own reward: applied at checkout if they chose to. If they
    // skipped it, it stays ISSUED so they can still apply it from their portal.
    await this.prisma.voucher.create({
      data: {
        patientId: patient.id,
        referralId: referral.id,
        kind: VoucherKind.REFEREE_REWARD,
        amountCents: REFERRAL_REWARD_CENTS,
        currency: REWARD_CURRENCY,
        status: friendRewardApplied ? VoucherStatus.APPLIED : VoucherStatus.ISSUED,
        appliedAt: friendRewardApplied ? new Date() : null,
        note: friendRewardApplied ? 'Applied as a discount on your first order' : null,
      },
    });

    const referrer = await this.prisma.patient.findUniqueOrThrow({ where: { id: referral.referrerId } });
    const referrerVoucher = await this.prisma.voucher.create({
      data: {
        patientId: referrer.id,
        referralId: referral.id,
        kind: VoucherKind.REFERRER_REWARD,
        amountCents: REFERRAL_REWARD_CENTS,
        currency: REWARD_CURRENCY,
      },
    });

    this.posthog.capture(referrer.id, 'referral_converted', { referred_patient_id: patient.id });

    if (referrer.voucherAutoApply) {
      await this.applyVoucher(referrerVoucher.id, referrer.id);
    }

    const amountLabel = formatAmount(REFERRAL_REWARD_CENTS, REWARD_CURRENCY);
    const portal = this.config.get<string>('PATIENT_APP_URL') ?? 'http://localhost:3000';
    await this.email.sendReferralRewardEmail(referrer.email, referrer.firstName, amountLabel, referrer.voucherAutoApply, `${portal}/rewards`);
  }

  /**
   * The single redemption path for a voucher. Today that means crediting the
   * patient's Stripe customer balance, since every patient is on a
   * subscription — Stripe deducts it from whatever invoice comes next on its
   * own. Once one-time-payment checkouts exist, this is the seam to extend:
   * a voucher could instead be attached as a discount to that specific
   * checkout, the same way CheckoutService does for a referred friend.
   */
  async applyVoucher(voucherId: string, patientId: string) {
    const voucher = await this.prisma.voucher.findUniqueOrThrow({ where: { id: voucherId } });
    if (voucher.patientId !== patientId) throw new ForbiddenException();
    if (voucher.status === VoucherStatus.APPLIED) return voucher;

    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    if (patient.stripeCustomerId) {
      await this.stripe.customers.createBalanceTransaction(patient.stripeCustomerId, {
        amount: -voucher.amountCents,
        currency: voucher.currency,
        description: `Referral reward voucher ${voucher.id}`,
      });
    } else {
      this.logger.warn(`Patient ${patientId} has no Stripe customer — voucher ${voucherId} marked applied without a real credit`);
    }

    const applied = await this.prisma.voucher.update({
      where: { id: voucherId },
      data: { status: VoucherStatus.APPLIED, appliedAt: new Date(), note: 'Credited to your account balance' },
    });

    this.posthogLogger.info('referral voucher applied', {
      operation: 'apply_voucher',
      voucher_kind: voucher.kind,
      amount_cents: voucher.amountCents,
      posthogDistinctId: patientId,
    });

    return applied;
  }

  async setVoucherAutoApply(patientId: string, autoApply: boolean) {
    await this.prisma.patient.update({ where: { id: patientId }, data: { voucherAutoApply: autoApply } });
    return this.myRewards(patientId);
  }

  async myRewards(patientId: string) {
    const code = await this.codeFor(patientId);
    const [patient, vouchers, referrals] = await Promise.all([
      this.prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { voucherAutoApply: true } }),
      this.prisma.voucher.findMany({ where: { patientId }, orderBy: { issuedAt: 'desc' } }),
      this.prisma.referral.findMany({
        where: { referrerId: patientId },
        orderBy: { createdAt: 'desc' },
        include: { referredLead: { select: { firstName: true } } },
      }),
    ]);

    return {
      code,
      link: this.linkFor(code),
      voucherAutoApply: patient.voucherAutoApply,
      vouchers,
      referrals: referrals.map((r) => ({
        id: r.id,
        firstNameInitial: r.referredLead.firstName?.[0]?.toUpperCase() ?? '?',
        status: r.status,
        createdAt: r.createdAt,
        convertedAt: r.convertedAt,
      })),
    };
  }
}

function generateCode(): string {
  // 10 uppercase hex chars — short enough to read out, long enough to not guess.
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(cents / 100);
}
