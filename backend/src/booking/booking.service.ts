import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Booking, BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import { BookingPurpose, GENERAL_PURPOSE, UNLINKED_PURPOSE, calLinkOf, eventSettingOf } from './booking-purposes';
import { signBookingToken, verifyBookingToken } from './booking-token';
import { CalcomClient } from './calcom/calcom.client';
import type { ProviderBookingEvent } from './calcom/calcom-webhook';
import { snapshotOf } from './calcom/calcom-api';
import { BookingModel, BookingSessionModel, StaffBookingModel } from './models/booking.model';

/** Statuses in which the time is still held. */
export const LIVE: BookingStatus[] = ['PENDING', 'CONFIRMED'];

/** How often one patient's bookings are re-read from the provider, at most. Screens poll; the provider shouldn't be. */
const SYNC_EVERY_MS = 5_000;
/** How far back a sync looks, so a booking that has just ended is still seen finishing. */
const SYNC_LOOKBACK_MS = 86_400_000;
/** Bookings we hold as live that the provider's list no longer shows are looked up one by one, up to this many. */
const MAX_LOOKUPS = 5;
/** The line a purpose may put on the booking for the host is a label, not a place for a story. */
const MAX_NOTES_LENGTH = 200;

/**
 * The booking system: one place that knows how to let someone pick a time with the clinic, what is booked,
 * and who needs to hear when that changes. Other modules never talk to the scheduling provider — they
 * register a purpose here, send patients to a booking session, and react in `onChange`.
 */
@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  private readonly purposes = new Map<string, BookingPurpose>([[GENERAL_PURPOSE.key, GENERAL_PURPOSE]]);
  private readonly syncedAt = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private config: ConfigService,
    private calcom: CalcomClient,
  ) {}

  /** Add something that can be booked. Call it from the owning module's `onModuleInit`. */
  register(...purposes: BookingPurpose[]) {
    for (const p of purposes) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(p.key)) throw new Error(`Booking purpose "${p.key}" must be UPPER_SNAKE_CASE`);
      this.purposes.set(p.key, p);
    }
  }

  private get tokenSecret() {
    return this.config.get<string>('BOOKING_TOKEN_SECRET')?.trim() || this.config.get<string>('JWT_SECRET')?.trim() || '';
  }

  /** The Cal.com event link a purpose opens, or null while it has none configured. */
  private linkFor(key: string) {
    return calLinkOf(this.config.get<string>(eventSettingOf(key))) ?? calLinkOf(this.config.get<string>(eventSettingOf('DEFAULT')));
  }

  /** The purpose whose configured event ends in this slug — for bookings that arrive without our token. */
  private purposeOfSlug(slug: string | null) {
    if (!slug) return null;
    for (const key of this.purposes.keys()) {
      if (calLinkOf(this.config.get<string>(eventSettingOf(key)))?.endsWith(`/${slug}`)) return key;
    }
    return null;
  }

  /** Whether patients can book this right now (the purpose exists and has an event configured). */
  available(purposeKey: string) {
    return this.purposes.has(purposeKey) && !!this.linkFor(purposeKey) && !!this.tokenSecret;
  }

  /**
   * What the scheduler needs for this patient to book: the event to open, their name and email to prefill,
   * and a signed token saying who they are and what the booking is for. Null when scheduling isn't set up
   * for the purpose, so callers can fall back to whatever they did before.
   */
  async session(patientId: string, purposeKey: string, referenceId?: string | null): Promise<BookingSessionModel | null> {
    const purpose = this.purposes.get(purposeKey);
    if (!purpose) throw new BadRequestException('Unknown booking purpose');
    const ref = referenceId?.trim() || null;
    if (purpose.requiresReference && !ref) throw new BadRequestException('This booking needs to be made from the thing it is for');
    await purpose.authorize?.(patientId, ref);

    const calLink = this.linkFor(purposeKey);
    if (!calLink || !this.tokenSecret) return null;

    await this.syncForPatient(patientId);
    const notes = (await purpose.describe?.(patientId, ref))?.trim().slice(0, MAX_NOTES_LENGTH) || null;
    const [patient, current] = await Promise.all([
      this.prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { firstName: true, lastName: true, email: true } }),
      this.prisma.booking.findFirst({
        where: { patientId, purpose: purposeKey, referenceId: ref, status: { in: LIVE }, endsAt: { gt: new Date() } },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    return {
      purpose: purposeKey,
      label: purpose.label,
      calLink,
      calOrigin: this.config.get<string>('CALCOM_ORIGIN')?.trim().replace(/\/$/, '') || null,
      name: `${patient.firstName} ${patient.lastName}`.trim(),
      email: patient.email,
      token: signBookingToken({ patientId, purpose: purposeKey, referenceId: ref }, this.tokenSecret),
      notes,
      current: current ? this.toModel(current) : null,
    };
  }

  /**
   * Applies one message from the provider. Safe to receive twice or out of order: a booking is keyed by the
   * provider's id, and a message older than the last one applied is dropped.
   */
  async applyProviderEvent(evt: ProviderBookingEvent, opts: { emailOwnerId?: string } = {}): Promise<Booking | null> {
    const existing = await this.prisma.booking.findUnique({ where: { providerUid: evt.uid } });
    if (existing?.providerUpdatedAt && existing.providerUpdatedAt > evt.sentAt) return existing;
    // Nothing new (a repeated webhook, or a sync that found what we already hold): no write, no audit, nobody told.
    if (existing && existing.status === evt.status && (!evt.startsAt || existing.startsAt.getTime() === evt.startsAt.getTime()) && (!evt.meetingUrl || existing.meetingUrl === evt.meetingUrl) && (existing.eventLink || !evt.eventLink) && (existing.patientId || !opts.emailOwnerId)) {
      return existing;
    }

    const replaced = evt.rescheduledFromUid ? await this.prisma.booking.findUnique({ where: { providerUid: evt.rescheduledFromUid } }) : null;
    // What a booking is for is only believed from our own signature (judged against when it was booked), and a
    // moved booking keeps what the original had. Without a token, a booking can still be the patient's own —
    // when it was found under their verified email — but it is never tied to a reference.
    const claims = verifyBookingToken(evt.token, this.tokenSecret, (evt.bookedAt ?? evt.sentAt).getTime());
    const known = existing ?? replaced;
    const trusted = claims && this.purposes.has(claims.purpose) ? claims : null;
    const patientId = known?.patientId ?? trusted?.patientId ?? opts.emailOwnerId ?? null;
    // A booking nobody owns stays unlinked, whatever event it is on; once it has an owner, its event says what it is for.
    const knownPurpose = known && known.purpose !== UNLINKED_PURPOSE ? known.purpose : null;
    const purpose = knownPurpose ?? trusted?.purpose ?? (patientId ? (this.purposeOfSlug(evt.eventTypeSlug) ?? GENERAL_PURPOSE.key) : UNLINKED_PURPOSE);
    const referenceId = known?.referenceId ?? trusted?.referenceId ?? null;

    if (!existing && (!evt.startsAt || !evt.endsAt)) {
      this.logger.warn(`Cal.com ${evt.trigger} for a booking we don't have (${evt.uid}) came without times — ignored`);
      return null;
    }
    if (patientId && !existing && !(await this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } }))) {
      this.logger.warn(`Cal.com ${evt.trigger} ${evt.uid} names a patient that does not exist — ignored`);
      return null;
    }
    const clinician = evt.hostEmail ? await this.prisma.clinician.findFirst({ where: { email: { equals: evt.hostEmail, mode: 'insensitive' } }, select: { id: true } }) : null;

    const fields = {
      status: evt.status,
      ...(evt.startsAt && { startsAt: evt.startsAt }),
      ...(evt.endsAt && { endsAt: evt.endsAt }),
      ...(evt.title && { title: evt.title }),
      ...(evt.attendeeName && { attendeeName: evt.attendeeName }),
      ...(evt.attendeeEmail && { attendeeEmail: evt.attendeeEmail }),
      ...(evt.hostName && { hostName: evt.hostName }),
      ...(evt.hostEmail && { hostEmail: evt.hostEmail }),
      ...(clinician && { clinicianId: clinician.id }),
      ...(evt.meetingUrl && { meetingUrl: evt.meetingUrl }),
      ...(evt.location && { location: evt.location }),
      ...(evt.cancelReason && { cancelReason: evt.cancelReason }),
      ...(evt.eventLink && { eventLink: evt.eventLink }),
      // A booking first seen unowned (a webhook without our token) becomes the patient's once found under their email.
      ...(existing && !existing.patientId && patientId && { patientId, ...(existing.purpose === UNLINKED_PURPOSE && { purpose }) }),
      providerUpdatedAt: evt.sentAt,
    };
    const booking = await this.save(async (tx) => {
      if (replaced && LIVE.includes(replaced.status)) {
        await tx.booking.update({ where: { id: replaced.id }, data: { status: 'RESCHEDULED', providerUpdatedAt: evt.sentAt } });
      }
      // Not an upsert: a cancellation carries no times, and Prisma checks an upsert's create half even when it updates.
      const saved = existing
        ? await tx.booking.update({ where: { id: existing.id }, data: fields })
        : await tx.booking.create({
            data: { ...fields, providerUid: evt.uid, purpose, referenceId, patientId, startsAt: evt.startsAt!, endsAt: evt.endsAt!, rescheduledFromUid: evt.rescheduledFromUid },
          });
      if (saved.patientId && (!existing || existing.status !== saved.status)) {
        await this.audit.log(
          { actorId: 'system:calcom', actorRole: UserRole.ADMIN, action: `BOOKING_${saved.status}`, resourceType: 'Booking', resourceId: saved.id, patientId: saved.patientId, metadata: { purpose, trigger: evt.trigger } },
          tx,
        );
      }
      return saved;
    });
    if (!booking) return this.applyProviderEvent(evt, opts); // the same booking was being created by another message: apply this one on top
    await this.notify(booking);
    return booking;
  }

  /** Runs the write, or returns null when it lost a race to create the same booking (two messages arriving together). */
  private async save(write: (tx: Prisma.TransactionClient) => Promise<Booking>): Promise<Booking | null> {
    try {
      return await this.prisma.$transaction(write);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
  }

  /** The patient's own bookings that are still to come, soonest first. */
  async mine(patientId: string): Promise<BookingModel[]> {
    await this.syncForPatient(patientId);
    const rows = await this.prisma.booking.findMany({
      where: { patientId, status: { in: LIVE }, endsAt: { gt: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: 50,
    });
    return rows.map((r) => this.toModel(r));
  }

  /** What the patient has already had, or gave up: newest first. A booking that was moved shows as its newer self only. */
  async past(patientId: string): Promise<BookingModel[]> {
    await this.syncForPatient(patientId);
    const rows = await this.prisma.booking.findMany({
      where: { patientId, status: { not: 'RESCHEDULED' }, OR: [{ status: { notIn: LIVE } }, { endsAt: { lte: new Date() } }] },
      orderBy: { startsAt: 'desc' },
      take: 20,
    });
    return rows.map((r) => this.toModel(r));
  }

  /**
   * Brings one patient's bookings into line with the provider, by asking it directly. Webhooks are the fast
   * path; this is what makes the record right when one never arrives (a deploy, an outage, a local machine
   * the provider can't reach). Never throws: a screen showing slightly old bookings beats one that errors.
   */
  async syncForPatient(patientId: string): Promise<void> {
    if (!this.calcom.configured) return;
    const last = this.syncedAt.get(patientId) ?? 0;
    if (Date.now() - last < SYNC_EVERY_MS) return;
    this.syncedAt.set(patientId, Date.now());
    try {
      const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { email: true } });
      if (!patient) return;
      const now = new Date();
      const listed = await this.calcom.listForAttendee(patient.email, new Date(now.getTime() - SYNC_LOOKBACK_MS));
      const seen = new Set<string>();
      for (const raw of listed) {
        const snap = snapshotOf(raw, now);
        // The provider matches emails loosely; only an exact match is this patient's.
        if (!snap || snap.attendeeEmail !== patient.email.toLowerCase()) continue;
        seen.add(snap.uid);
        await this.applyProviderEvent(snap, { emailOwnerId: patientId });
      }
      // Anything we still hold as live that the list didn't mention has changed in a way the list hides.
      const missing = await this.prisma.booking.findMany({
        where: { patientId, status: { in: LIVE }, providerUid: { notIn: [...seen] } },
        select: { providerUid: true },
        take: MAX_LOOKUPS,
      });
      for (const m of missing) {
        const snap = snapshotOf(await this.calcom.get(m.providerUid), now);
        if (snap) await this.applyProviderEvent(snap, { emailOwnerId: patientId });
      }
    } catch (err) {
      this.logger.warn(`Could not sync bookings for patient ${patientId}: ${(err as Error).message}`);
    }
  }

  /**
   * What the scheduler needs to move one of the patient's own bookings: the event it was booked on, opened
   * on that booking. Null when it can't be moved from here (already over, or its event isn't known).
   */
  async rescheduleSession(patientId: string, uid: string): Promise<BookingSessionModel | null> {
    const booking = await this.prisma.booking.findUnique({ where: { providerUid: uid } });
    if (!booking || booking.patientId !== patientId) throw new NotFoundException('Booking not found');
    const calLink = this.eventLinkOf(booking);
    if (!calLink || !this.movable(booking) || !this.tokenSecret) return null;
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { firstName: true, lastName: true, email: true } });
    return {
      purpose: booking.purpose,
      label: this.purposes.get(booking.purpose)?.label ?? GENERAL_PURPOSE.label,
      calLink,
      calOrigin: this.config.get<string>('CALCOM_ORIGIN')?.trim().replace(/\/$/, '') || null,
      name: `${patient.firstName} ${patient.lastName}`.trim(),
      email: patient.email,
      token: signBookingToken({ patientId, purpose: this.purposes.has(booking.purpose) ? booking.purpose : GENERAL_PURPOSE.key, referenceId: booking.referenceId }, this.tokenSecret),
      rescheduleUid: booking.providerUid,
      current: this.toModel(booking),
    };
  }

  private movable(b: Booking) {
    return LIVE.includes(b.status) && b.startsAt > new Date();
  }

  private eventLinkOf(b: Booking) {
    return calLinkOf(b.eventLink) ?? (this.purposes.has(b.purpose) ? this.linkFor(b.purpose) : null);
  }

  /** Everything booked in a window, for the clinical team's diary. */
  async between(from: Date, to: Date, patientId?: string): Promise<StaffBookingModel[]> {
    const rows = await this.prisma.booking.findMany({
      where: { startsAt: { gte: from, lt: to }, status: { in: [...LIVE, 'COMPLETED'] }, ...(patientId && { patientId }) },
      orderBy: { startsAt: 'asc' },
      take: 500,
    });
    return rows.map((r) => ({ ...this.toModel(r), patientId: r.patientId, attendeeName: r.attendeeName, attendeeEmail: r.attendeeEmail, clinicianId: r.clinicianId }));
  }

  /** The live booking attached to something, if any — for modules that own the reference. */
  currentFor(purposeKeys: string[], referenceId: string) {
    return this.prisma.booking.findFirst({ where: { purpose: { in: purposeKeys }, referenceId, status: { in: LIVE } }, orderBy: { startsAt: 'desc' } });
  }

  /** A patient cancels their own booking. The provider frees the slot and tells the host. */
  async cancelMine(patientId: string, uid: string, reason?: string): Promise<BookingModel> {
    const booking = await this.prisma.booking.findUnique({ where: { providerUid: uid } });
    if (!booking || booking.patientId !== patientId) throw new NotFoundException('Booking not found');
    return this.toModel(await this.cancel(booking, { actorId: patientId, actorRole: UserRole.PATIENT }, reason));
  }

  /**
   * Cancels whatever is booked for a reference — for the module that owns it (e.g. its request was withdrawn).
   * Pass the patient so the provider is asked first: a booking we never heard about must not be left behind.
   */
  async cancelFor(purposeKeys: string[], referenceId: string, actor: { actorId: string; actorRole: UserRole }, reason?: string, patientId?: string) {
    if (patientId) {
      this.syncedAt.delete(patientId); // this must see the provider's present state, not one from a few seconds ago
      await this.syncForPatient(patientId);
    }
    const booking = await this.currentFor(purposeKeys, referenceId);
    if (booking) await this.cancel(booking, actor, reason, { silent: true });
  }

  private async cancel(booking: Booking, actor: { actorId: string; actorRole: UserRole }, reason?: string, opts: { silent?: boolean } = {}) {
    if (!LIVE.includes(booking.status)) throw new BadRequestException(`This booking is already ${booking.status.toLowerCase()}`);
    if (!this.calcom.configured) throw new ServiceUnavailableException('Scheduling is not set up');
    await this.calcom.cancel(booking.providerUid, reason);
    // The provider's webhook will say the same; applying it now means nobody sees a cancelled slot as live meanwhile.
    const { count } = await this.prisma.booking.updateMany({
      where: { id: booking.id, status: { in: LIVE } },
      data: { status: 'CANCELLED', cancelReason: reason?.trim().slice(0, 500) || null },
    });
    const saved = await this.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    if (count === 1) {
      if (saved.patientId) await this.audit.log({ ...actor, action: 'BOOKING_CANCELLED', resourceType: 'Booking', resourceId: saved.id, patientId: saved.patientId, metadata: { purpose: saved.purpose } });
      // The owner asked for this cancellation itself, so it doesn't need telling.
      if (!opts.silent) await this.notify(saved);
    }
    return saved;
  }

  /** Tells the purpose's owner. A failure there is logged, never thrown: the booking itself is already saved. */
  private async notify(booking: Booking) {
    try {
      await this.purposes.get(booking.purpose)?.onChange?.(booking);
    } catch (err) {
      this.logger.error(`Booking ${booking.id} (${booking.purpose}) saved, but its handler failed: ${(err as Error).message}`);
    }
  }

  toModel(b: Booking): BookingModel {
    return {
      id: b.id,
      uid: b.providerUid,
      purpose: b.purpose,
      referenceId: b.referenceId,
      status: b.status,
      title: b.title,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      meetingUrl: b.meetingUrl,
      location: b.location,
      hostName: b.hostName,
      cancelReason: b.cancelReason,
      canReschedule: this.movable(b) && !!this.eventLinkOf(b),
    };
  }
}
