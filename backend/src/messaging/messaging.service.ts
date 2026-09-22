import { Injectable } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import { SendMessageInput } from './dto/send-message.input';

const pubSub = new PubSub();

@Injectable()
export class MessagingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
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
    return pubSub.asyncIterableIterator(`NEW_MESSAGE.${consultationId}`);
  }
}
