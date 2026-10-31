import { Args, Field, ID, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/access-roles';
import { ClinicianRole } from '../common/enums';
import { MessageModel } from '../messaging/models/message.model';
import { TicketModel } from '../tickets/models/ticket.model';
import { TicketConversationService } from './ticket-conversation.service';

@ObjectType('TicketReplyResult')
class TicketReplyResultModel {
  @Field(() => MessageModel)
  message: MessageModel;

  @Field(() => TicketModel, { nullable: true, description: 'The ticket after the reply; null only if it could not be read back (the message was still sent)' })
  ticket: TicketModel | null;
}

const TICKET_STAFF = [ClinicianRole.ADMIN, ClinicianRole.CX_TEAM, ClinicianRole.DOCTOR] as const;

@Resolver()
export class TicketConversationResolver {
  constructor(private conversations: TicketConversationService) {}

  @Authorized(...TICKET_STAFF)
  @Query(() => [MessageModel], { description: 'The patient’s conversation with the care team, for someone working one of their tickets' })
  ticketConversation(@CurrentUser() user: AuthUser, @Args('ticketId', { type: () => ID }) ticketId: string) {
    return this.conversations.conversation(user, ticketId);
  }

  @Authorized(...TICKET_STAFF)
  @Mutation(() => TicketReplyResultModel, { description: 'Writes to the patient from the ticket; the ticket then waits on the patient' })
  replyToTicket(@CurrentUser() user: AuthUser, @Args('ticketId', { type: () => ID }) ticketId: string, @Args('content') content: string) {
    return this.conversations.reply(user, ticketId, content);
  }
}
