import { Resolver, Query, Mutation, Subscription, Args, ID } from '@nestjs/graphql';
import { AuditRead } from '../audit/audit-read.interceptor';
import { MessagingService } from './messaging.service';
import { MessageModel } from './models/message.model';
import { SendMessageInput } from './dto/send-message.input';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, STAFF } from '../auth/access-roles';

@Resolver(() => MessageModel)
export class MessagingResolver {
  constructor(private messagingService: MessagingService) {}

  @Authorized(...STAFF, 'PATIENT')
  @AuditRead('Consultation', 'consultationId')
  @Query(() => [MessageModel])
  async messages(@CurrentUser() user: AuthUser, @Args('consultationId', { type: () => ID }) consultationId: string) {
    await this.messagingService.assertCanAccess(user, consultationId);
    return this.messagingService.findByConsultation(consultationId);
  }

  @Authorized(...STAFF, 'PATIENT')
  @Mutation(() => MessageModel)
  async sendMessage(@CurrentUser() user: AuthUser, @Args('input') input: SendMessageInput) {
    await this.messagingService.assertCanAccess(user, input.consultationId);
    return this.messagingService.send(user.id, user.role as any, input);
  }

  @Authorized(...STAFF, 'PATIENT')
  @Subscription(() => MessageModel, {
    filter: (payload, variables) =>
      payload.newMessage.consultationId === variables.consultationId,
  })
  async newMessage(@CurrentUser() user: AuthUser, @Args('consultationId', { type: () => ID }) consultationId: string) {
    await this.messagingService.assertCanAccess(user, consultationId);
    return this.messagingService.subscribeToNewMessages(consultationId);
  }
}
