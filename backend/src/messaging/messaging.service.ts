import { Injectable } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import { SendMessageInput } from './dto/send-message.input';
import { PostHogService } from '../posthog/posthog.service';

const pubSub = new PubSub();

@Injectable()
export class MessagingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private posthog: PostHogService,
  ) {}

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

  subscribeToNewMessages(consultationId: string) {
    return pubSub.asyncIterator(`NEW_MESSAGE.${consultationId}`);
  }
}
