import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { TicketsModule } from '../tickets/tickets.module';
import { TicketConversationService } from './ticket-conversation.service';
import { TicketConversationResolver } from './ticket-conversation.resolver';

@Module({
  imports: [PrismaModule, MessagingModule, TicketsModule],
  providers: [TicketConversationService, TicketConversationResolver],
})
export class TicketConversationModule {}
