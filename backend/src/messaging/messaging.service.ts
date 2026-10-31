import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { NotificationKind } from '@telehealth/shared-types';
import { PubSub } from 'graphql-subscriptions';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import { SendMessageInput } from './dto/send-message.input';
import { PostHogService } from '../posthog/posthog.service';
import { AuthUser } from '../auth/access-roles';
import { NotifierService } from '../notifications/notifier.service';
import { ClinicianRole } from '../common/enums';
import { MessageUrgencyService } from '../ai/message-urgency.service';
import { SupportBotService } from '../support-bot/support-bot.service';
import { ASSISTANT_ID } from '../tickets/tickets.service';
import { appError, ErrorCode } from '../common/errors/app-error';

const pubSub = new PubSub();

/** Files a patient can send with one chat message. */
export const MAX_MESSAGE_ATTACHMENTS = 3;
/** How fast one patient may send (see checkPatientPace): far above anyone typing, low enough to stop a script. */
export const PATIENT_MESSAGES_PER_MINUTE = 20;
export const PATIENT_MESSAGES_PER_HOUR = 200;

// One notification per conversation thread and side (see NotifierService groupKey). A thread is a consultation, or the
// pre-consultation thread; a patient can have several, and each keeps its own notification, so reading or answering one
// never closes the alert for another.
const threadId = (consultationId: string | null) => consultationId ?? 'pre';
const patientMessageKey = (patientId: string, consultationId: string | null) => `team-msg:${patientId}:${threadId(consultationId)}`;
const staffMessageKey = (patientId: string, consultationId: string | null) => `patient-msg:${patientId}:${threadId(consultationId)}`;
// Before threads had their own notification, one was kept per patient. Any still unread is closed along with the thread
// it was about, so it cannot be left open for good.
const legacyPatientMessageKey = (patientId: string) => `team-msg:${patientId}`;
const legacyStaffMessageKey = (patientId: string) => `patient-msg:${patientId}`;

@Injectable()
export class MessagingService implements OnModuleInit {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private posthog: PostHogService,
    @Optional() private notifier?: NotifierService,
    @Optional() private urgency?: MessageUrgencyService,
    @Optional() private supportBot?: SupportBotService,
  ) {}

  onModuleInit() {
    // The automated assistant posts through here, so its messages reach the thread live like anyone else's.
    this.supportBot?.useSender(async (patientId, consultationId, content, meta) => { await this.sendAssistant(patientId, consultationId, content, meta); });
  }

  /** A message from the automated support assistant, labelled as such. */
  sendAssistant(patientId: string, consultationId: string | null, content: string, meta: { articleId?: string } = {}) {
    return this.deliver(ASSISTANT_ID, UserRole.CLINICIAN, { patientId, consultationId }, content, true, [], meta.articleId);
  }

  // Staff can reach any thread; a patient only threads on their own consultations.
  async assertCanAccess(user: AuthUser, consultationId: string) {
    if (user.role !== UserRole.PATIENT) return;
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: { patientId: true },
    });
    if (consultation?.patientId !== user.id) throw new ForbiddenException();
  }

  /**
   * Where a new message goes: the consultation given, else the patient's
   * newest consultation, else — for a patient with none yet — their
   * pre-consultation thread (consultationId null).
   */
  async resolveThread(user: AuthUser, input: Pick<SendMessageInput, 'consultationId' | 'patientId'>) {
    if (input.consultationId) {
      await this.assertCanAccess(user, input.consultationId);
      const consultation = await this.prisma.consultation.findUnique({ where: { id: input.consultationId }, select: { patientId: true } });
      if (!consultation) throw new ForbiddenException();
      return { patientId: consultation.patientId, consultationId: input.consultationId };
    }
    const patientId = user.role === UserRole.PATIENT ? user.id : input.patientId;
    if (!patientId) throw new BadRequestException('Say which patient or consultation this message is for');
    const newest = await this.prisma.consultation.findFirst({ where: { patientId }, orderBy: { submittedAt: 'desc' }, select: { id: true } });
    return { patientId, consultationId: newest?.id ?? null };
  }

  /** A message written in the app: the thread is worked out from the sender (see resolveThread). */
  async sendAs(user: AuthUser, input: SendMessageInput) {
    if (user.role === UserRole.PATIENT) await this.checkPatientPace(user);
    // Only a patient sends files, and only their own, uploaded for this purpose and not yet used.
    const attachmentIds = user.role === UserRole.PATIENT ? [...new Set(input.attachmentIds ?? [])] : [];
    if (input.attachmentIds?.length && user.role !== UserRole.PATIENT) throw new BadRequestException('Only patients can attach files');
    if (!input.content.trim() && attachmentIds.length === 0) throw new BadRequestException('Write a message or attach a file');
    if (attachmentIds.length > MAX_MESSAGE_ATTACHMENTS) throw new BadRequestException(`You can attach up to ${MAX_MESSAGE_ATTACHMENTS} files`);
    return this.deliver(user.id, user.role as UserRole, await this.resolveThread(user, input), input.content, false, attachmentIds);
  }

  /**
   * A cap on how fast one patient can send. Every patient message is read by the AI (the urgency check, the assistant), so
   * a script or a stuck app sending thousands would cost real money. The limits are far above what a person types, and
   * count the patient's own messages, so staff and other patients are never held up by one account.
   */
  private async checkPatientPace(user: AuthUser) {
    // A patient's own id is their patient id (see resolveThread).
    const now = Date.now();
    const sentSince = (ms: number) => this.prisma.message.count({ where: { patientId: user.id, senderRole: UserRole.PATIENT, sentAt: { gte: new Date(now - ms) } } });
    const [lastMinute, lastHour] = await Promise.all([sentSince(60_000), sentSince(3_600_000)]);
    if (lastMinute >= PATIENT_MESSAGES_PER_MINUTE || lastHour >= PATIENT_MESSAGES_PER_HOUR) {
      this.logger.warn(`Patient ${user.id} hit the message limit (${lastMinute} in a minute, ${lastHour} in an hour)`);
      // The hourly limit lasts longer, so when both are reached that is the one to tell the patient about.
      throw appError(ErrorCode.RATE_LIMITED, lastHour >= PATIENT_MESSAGES_PER_HOUR ? 'You’ve sent a lot of messages in the last hour. Please wait a little before sending more. If something is urgent, call emergency services.' : 'You’ve sent a lot of messages very quickly. Please wait a minute, then send the rest.');
    }
  }

  /** A message from staff into a thread that is already known (a consultation, or the pre-consultation one when `consultationId` is null). */
  sendToThread(user: AuthUser, thread: { patientId: string; consultationId: string | null }, content: string) {
    if (user.role === UserRole.PATIENT) throw new ForbiddenException();
    return this.deliver(user.id, user.role as UserRole, thread, content, false, []);
  }

  /** A message on a known consultation, e.g. posted by the system on a clinician's behalf. */
  async send(senderId: string, senderRole: UserRole, input: { consultationId: string; content: string }) {
    const consultation = await this.prisma.consultation.findUniqueOrThrow({ where: { id: input.consultationId }, select: { patientId: true } });
    return this.deliver(senderId, senderRole, { patientId: consultation.patientId, consultationId: input.consultationId }, input.content);
  }

  private async deliver(
    senderId: string,
    senderRole: UserRole,
    { patientId, consultationId }: { patientId: string; consultationId: string | null },
    content: string,
    isAi = false,
    attachmentIds: string[] = [],
    aiArticleId?: string,
  ) {
    if (attachmentIds.length) {
      const own = await this.prisma.uploadedFile.count({ where: { id: { in: attachmentIds }, patientId, kind: 'SUPPORT_ATTACHMENT', ticketId: null, messageId: null } });
      if (own !== attachmentIds.length) throw new BadRequestException('One of the files could not be attached. Please add it again.');
    }
    const data = { patientId, consultationId, senderId, senderRole, content, isAi, ...(aiArticleId ? { aiArticleId } : {}) };
    // With files, the message and the link to them are saved together, so a file is never half attached.
    const message = attachmentIds.length
      ? await this.prisma.$transaction(async (tx) => {
          const created = await tx.message.create({ data });
          const claimed = await tx.uploadedFile.updateMany({ where: { id: { in: attachmentIds }, patientId, kind: 'SUPPORT_ATTACHMENT', ticketId: null, messageId: null }, data: { messageId: created.id } });
          // Another send took a file first: undo this one rather than send a message without the files the patient chose.
          if (claimed.count !== attachmentIds.length) throw new BadRequestException('One of the files could not be attached. Please add it again.');
          return created;
        })
      : await this.prisma.message.create({ data });

    await this.audit.log({
      actorId: senderId,
      actorRole: senderRole,
      action: 'MESSAGE_SENT',
      resourceType: 'Message',
      resourceId: message.id,
      patientId,
      metadata: { consultationId, ...(attachmentIds.length ? { attachments: attachmentIds.length } : {}) },
    });

    this.posthog.capture(senderId, 'message_sent', {
      consultation_id: consultationId,
      message_id: message.id,
      sender_role: senderRole,
    });

    // The pre-consultation thread has no live channel; both sides poll it.
    if (consultationId) pubSub.publish(`NEW_MESSAGE.${consultationId}`, { newMessage: message });
    // Waited for, so the notification is recorded before this request ends (an un-awaited write can be cut off on a
    // serverless host, or land after the message was already read). It never throws: the message is saved.
    await this.notifyOtherSide(message, consultationId, isAi).catch((err) => this.logger.error(`Notifying about message ${message.id} failed: ${err?.message}`, err?.stack));
    // A patient's message is also checked for urgency, in the background so sending never waits on it: the mark only ever
    // adds visibility, and a check that fails leaves the message as it was. (It never throws.)
    if (senderRole === UserRole.PATIENT) void this.urgency?.check(message.id);
    // The automated assistant starts its quiet timer on a patient's message, and steps back when a person writes.
    if (senderRole === UserRole.PATIENT) await this.supportBot?.onPatientMessage({ patientId, consultationId });
    else if (!isAi) await this.supportBot?.onStaffMessage({ patientId, consultationId });
    return message;
  }

  /**
   * The care team wrote: the patient hears about it (one notification however many messages, until they read them),
   * and the "waiting for a reply" notifications on the staff side are done. The patient wrote: the clinician on the
   * consultation hears about it, or the whole clinical team when nobody has picked it up yet.
   */
  private async notifyOtherSide(message: { id: string; patientId: string; senderRole: string; sentAt: Date }, consultationId: string | null, isAi = false) {
    if (!this.notifier) return;
    const { patientId } = message;
    if (message.senderRole !== UserRole.PATIENT) {
      // The care team answered this thread: its "waiting for a reply" alert is done. Other threads stay as they are.
      // The assistant's answer does not count: the team's "waiting for a reply" alert stays until a person has answered.
      if (!isAi) await this.resolveStaffAlert(patientId, consultationId);
      await this.notifier.toPatient(patientId, { kind: isAi ? NotificationKind.ASSISTANT_MESSAGE : NotificationKind.CARE_TEAM_MESSAGE, href: '/messages', groupKey: patientMessageKey(patientId, consultationId) });
      // The patient may have opened the chat while the notification was being written: then it is already handled.
      const stored = await this.prisma.message.findUnique({ where: { id: message.id }, select: { readAt: true } });
      if (stored?.readAt) await this.notifier.resolve(patientMessageKey(patientId, consultationId));
      return;
    }
    const [patient, consultation] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: patientId }, select: { firstName: true, lastName: true } }),
      consultationId ? this.prisma.consultation.findUnique({ where: { id: consultationId }, select: { clinicianId: true } }) : null,
    ]);
    if (!patient) return;
    const clinicalTeam = [ClinicianRole.ADMIN, ClinicianRole.DOCTOR, ClinicianRole.CX_TEAM];
    await this.notifier.toStaff(
      // The assigned clinician; the whole team when nobody is assigned or that person can no longer be reached.
      { clinicianIds: consultation?.clinicianId ? [consultation.clinicianId] : undefined, roles: clinicalTeam },
      {
        kind: NotificationKind.PATIENT_MESSAGE,
        params: { patient: `${patient.firstName} ${patient.lastName}` },
        href: `/patients?patient=${patientId}&tab=messages`,
        groupKey: staffMessageKey(patientId, consultationId),
      },
    );
    // Someone from the care team may have replied while the notification was being written: then it is answered.
    // Only a reply in this same thread counts.
    const replied = await this.prisma.message.count({ where: { patientId, consultationId, senderRole: { not: UserRole.PATIENT }, isAi: false, sentAt: { gt: message.sentAt } } });
    if (replied > 0) await this.notifier.resolve(staffMessageKey(patientId, consultationId));
  }

  /** The staff alert for one thread is done, and so is any older per-patient one. */
  private async resolveStaffAlert(patientId: string, consultationId: string | null) {
    await this.notifier?.resolve(staffMessageKey(patientId, consultationId));
    await this.notifier?.resolve(legacyStaffMessageKey(patientId));
  }

  /** The patient has read one thread: its notification is done, and so is any older per-patient one. */
  private async resolvePatientNotification(patientId: string, consultationId: string | null) {
    await this.notifier?.resolve(patientMessageKey(patientId, consultationId));
    await this.notifier?.resolve(legacyPatientMessageKey(patientId));
  }

  /** The files sent with one message (names only; the bytes are served, with an audit entry, from /uploads). */
  attachmentsOf(messageId: string) {
    // Collected for a moment and fetched together: a list of messages costs one query, not one per message.
    return new Promise<Array<{ id: string; filename: string; mimeType: string }>>((resolve, reject) => {
      this.attachmentQueue.push({ messageId, resolve, reject });
      if (this.attachmentQueue.length > 1) return;
      setImmediate(async () => {
        const batch = this.attachmentQueue.splice(0);
        try {
          const rows = await this.prisma.uploadedFile.findMany({ where: { messageId: { in: [...new Set(batch.map((b) => b.messageId))] } }, select: { id: true, filename: true, mimeType: true, messageId: true }, orderBy: { createdAt: 'asc' } });
          for (const b of batch) b.resolve(rows.filter((r) => r.messageId === b.messageId).map(({ id, filename, mimeType }) => ({ id, filename, mimeType })));
        } catch (err) {
          for (const b of batch) b.reject(err);
        }
      });
    });
  }
  private attachmentQueue: Array<{ messageId: string; resolve: (v: any) => void; reject: (e: unknown) => void }> = [];

  /** Messages a patient sent or received before they had a consultation. */
  findPreConsultation(patientId: string) {
    return this.prisma.message.findMany({ where: { patientId, consultationId: null }, orderBy: { sentAt: 'asc' } });
  }

  /** Like markRead, for the pre-consultation thread. */
  async markPreConsultationRead(user: AuthUser, patientId: string): Promise<number> {
    const byPatient = user.role === UserRole.PATIENT;
    const { count } = await this.prisma.message.updateMany({
      where: { patientId, consultationId: null, readAt: null, senderRole: byPatient ? { not: UserRole.PATIENT } : UserRole.PATIENT },
      data: { readAt: new Date() },
    });
    if (byPatient) await this.resolvePatientNotification(patientId, null);
    return count;
  }

  findByConsultation(consultationId: string) {
    return this.prisma.message.findMany({
      where: { consultationId },
      orderBy: { sentAt: 'asc' },
    });
  }

  /**
   * The reader has the conversation open: everything the other side sent that was still unread is now read.
   * The patient reads what the care team wrote and the care team reads what the patient wrote — nobody marks
   * their own messages. Tells the other side straight away, so their ticks turn blue while they watch.
   */
  async markRead(user: AuthUser, consultationId: string): Promise<number> {
    const byPatient = user.role === UserRole.PATIENT;
    const readAt = new Date();
    const { count } = await this.prisma.message.updateMany({
      where: { consultationId, readAt: null, senderRole: byPatient ? { not: UserRole.PATIENT } : UserRole.PATIENT },
      data: { readAt },
    });
    if (count > 0) pubSub.publish(`MESSAGES_READ.${consultationId}`, { messagesRead: { consultationId, byPatient, readAt } });
    if (byPatient) {
      const thread = await this.prisma.consultation.findUnique({ where: { id: consultationId }, select: { patientId: true } });
      await this.resolvePatientNotification(thread?.patientId ?? user.id, consultationId);
    }
    return count;
  }

  subscribeToMessagesRead(consultationId: string) {
    return pubSub.asyncIterator(`MESSAGES_READ.${consultationId}`);
  }

  subscribeToNewMessages(consultationId: string) {
    return pubSub.asyncIterator(`NEW_MESSAGE.${consultationId}`);
  }
}
