import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

export const CODE_TTL_MS = 10 * 60_000;
export const TOKEN_TTL_MS = 30 * 60_000;
export const RESEND_COOLDOWN_MS = 30_000;
export const MAX_CODES_PER_HOUR = 5;
export const MAX_WRONG_CODES = 5;
const HOUR_MS = 3_600_000;

const normalise = (email: string) => email.trim().toLowerCase();
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const tooMany = (message: string) => new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);

/**
 * Proof that a visitor can read the inbox of the address they gave the quiz. They ask for a code, type it in, and get a
 * short-lived token the quiz hands to createLead: without it no lead is saved or changed for that email. This is what
 * stops someone typing another person's address to replace the answers they are in the middle of giving.
 */
@Injectable()
export class EmailVerificationService {
  constructor(private prisma: PrismaService, private email: EmailService, private config: ConfigService) {}

  /** A local switch for development (the dev payment test page has no inbox); ignored in production. */
  private get disabled() {
    return this.config.get<string>('DISABLE_EMAIL_VERIFICATION') === 'true' && this.config.get<string>('NODE_ENV') !== 'production';
  }

  async requestCode(rawEmail: string, now = new Date()): Promise<void> {
    const email = normalise(rawEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new BadRequestException('Please enter a valid email address.');

    const row = await this.prisma.emailVerification.findUnique({ where: { email } });
    if (row && now.getTime() - row.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      throw tooMany('Please wait a moment before asking for another code.');
    }
    const inWindow = !!row && now.getTime() - row.sentWindowStart.getTime() < HOUR_MS;
    if (row && inWindow && row.sentCount >= MAX_CODES_PER_HOUR) {
      throw tooMany('Too many codes were sent to this address. Please try again in a while.');
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const salt = crypto.randomBytes(8).toString('hex');
    const data = {
      codeSalt: salt,
      codeHash: sha256(`${salt}:${code}`),
      codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
      lastSentAt: now,
      sentCount: inWindow ? row!.sentCount + 1 : 1,
      sentWindowStart: inWindow ? row!.sentWindowStart : now,
      // A new code starts a new check: an earlier proof for this address no longer stands.
      tokenHash: null,
      tokenExpiresAt: null,
    };
    await this.prisma.emailVerification.upsert({ where: { email }, create: { email, ...data }, update: data });

    try {
      await this.email.sendVerificationCodeEmail(email, code);
    } catch {
      throw new HttpException('We couldn’t send the code. Please try again in a moment.', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /** Checks the code and, if it is right, returns the proof the quiz needs to save a lead for this email. */
  async verifyCode(rawEmail: string, code: string, now = new Date()): Promise<string> {
    const email = normalise(rawEmail);
    const row = await this.prisma.emailVerification.findUnique({ where: { email } });
    if (!row?.codeHash || !row.codeSalt || !row.codeExpiresAt || row.codeExpiresAt.getTime() < now.getTime()) {
      throw new BadRequestException('That code has expired. Please ask for a new one.');
    }
    if (row.attempts >= MAX_WRONG_CODES) throw new BadRequestException('Too many wrong codes. Please ask for a new one.');

    if (!same(row.codeHash, sha256(`${row.codeSalt}:${code.trim()}`))) {
      await this.prisma.emailVerification.update({ where: { email }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('That code isn’t right. Please check it and try again.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.emailVerification.update({
      where: { email },
      // The code works once; the proof lasts long enough to finish the quiz, and to retry if saving fails.
      data: { codeHash: null, codeSalt: null, codeExpiresAt: null, attempts: 0, tokenHash: sha256(token), tokenExpiresAt: new Date(now.getTime() + TOKEN_TTL_MS) },
    });
    return token;
  }

  /** Throws unless `token` is the live proof for this email. */
  async assertVerified(rawEmail: string, token: string | null | undefined, now = new Date()): Promise<void> {
    if (this.disabled) return;
    const email = normalise(rawEmail);
    const row = token ? await this.prisma.emailVerification.findUnique({ where: { email } }) : null;
    if (!row?.tokenHash || !row.tokenExpiresAt || row.tokenExpiresAt.getTime() < now.getTime() || !same(row.tokenHash, sha256(token!))) {
      throw new BadRequestException('Please verify your email address first.');
    }
  }
}
