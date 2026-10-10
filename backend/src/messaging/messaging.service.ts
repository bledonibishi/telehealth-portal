import { BadRequestException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
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

const pubSub = new PubSub();

// One notification per conversation and side (see NotifierService groupKey).
const patientMessageKey = (patientId: string) => `team-msg:${patientId}`;
const staffMessageKey = (patientId: string) => `patient-msg:${patientId}`;

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private posthog: PostHogService,
    @Optional() private notifier?: NotifierService,
  ) {}

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
    return this.deliver(user.id, user.role as UserRole, await this.resolveThread(user, input), input.content);
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
  ) {
    const message = await this.prisma.message.create({
      data: { patientId, consultationId, senderId, senderRole, content },
    });

    await this.audit.log({
      actorId: senderId,
      actorRole: senderRole,
      action: 'MESSAGE_SENT',
      resourceType: 'Message',
      resourceId: message.id,
      patientId,
      metadata: { consultationId },
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
    await this.notifyOtherSide(message, consultationId).catch((err) => this.logger.error(`Notifying about message ${message.id} failed: ${err?.message}`, err?.stack));
    return message;
  }

  /**
   * The care team wrote: the patient hears about it (one notification however many messages, until they read them),
   * and the "waiting for a reply" notifications on the staff side are done. The patient wrote: the clinician on the
   * consultation hears about it, or the whole clinical team when nobody has picked it up yet.
   */
  private async notifyOtherSide(message: { id: string; patientId: string; senderRole: string; sentAt: Date }, consultationId: string | null) {
    if (!this.notifier) return;
    const { patientId } = message;
    if (message.senderRole !== UserRole.PATIENT) {
      await this.notifier.resolve(staffMessageKey(patientId));
      await this.notifier.toPatient(patientId, { kind: NotificationKind.CARE_TEAM_MESSAGE, href: '/messages', groupKey: patientMessageKey(patientId) });
      // The patient may have opened the chat while the notification was being written: then it is already handled.
      const stored = await this.prisma.message.findUnique({ where: { id: message.id }, select: { readAt: true } });
      if (stored?.readAt) await this.notifier.resolve(patientMessageKey(patientId));
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
        groupKey: staffMessageKey(patientId),
      },
    );
    // Someone from the care team may have replied while the notification was being written: then it is answered.
    const replied = await this.prisma.message.count({ where: { patientId, senderRole: { not: UserRole.PATIENT }, sentAt: { gt: message.sentAt } } });
    if (replied > 0) await this.notifier.resolve(staffMessageKey(patientId));
  }

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
    if (byPatient) await this.notifier?.resolve(patientMessageKey(patientId));
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
    if (byPatient) await this.notifier?.resolve(patientMessageKey(user.id));
    return count;
  }

  subscribeToMessagesRead(consultationId: string) {
    return pubSub.asyncIterator(`MESSAGES_READ.${consultationId}`);
  }

  subscribeToNewMessages(consultationId: string) {
    return pubSub.asyncIterator(`NEW_MESSAGE.${consultationId}`);
  }
}
