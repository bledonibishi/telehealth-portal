import { ForbiddenException, Injectable } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import { SendMessageInput } from './dto/send-message.input';
import { PostHogService } from '../posthog/posthog.service';
import { AuthUser } from '../auth/access-roles';

const pubSub = new PubSub();

@Injectable()
export class MessagingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private posthog: PostHogService,
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

  async send(senderId: string, senderRole: UserRole, input: SendMessageInput) {
    const message = await this.prisma.message.create({
      data: {
        consultationId: input.consultationId,
        senderId,
        senderRole,
        content: input.content,
      },
    });

    await this.audit.log({
      actorId: senderId,
      actorRole: senderRole,
      action: 'MESSAGE_SENT',
      resourceType: 'Message',
      resourceId: message.id,
      metadata: { consultationId: input.consultationId },
    });

    this.posthog.capture(senderId, 'message_sent', {
      consultation_id: input.consultationId,
      message_id: message.id,
      sender_role: senderRole,
    });

    pubSub.publish(`NEW_MESSAGE.${input.consultationId}`, { newMessage: message });
    return message;
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
    return count;
  }

  subscribeToMessagesRead(consultationId: string) {
    return pubSub.asyncIterator(`MESSAGES_READ.${consultationId}`);
  }

  subscribeToNewMessages(consultationId: string) {
    return pubSub.asyncIterator(`NEW_MESSAGE.${consultationId}`);
  }
}
