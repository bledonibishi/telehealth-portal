import { Resolver, Query, Mutation, Subscription, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessageModel } from './models/message.model';
import { SendMessageInput } from './dto/send-message.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => MessageModel)
export class MessagingResolver {
  constructor(private messagingService: MessagingService) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => [MessageModel])
  messages(@Args('consultationId', { type: () => ID }) consultationId: string) {
    return this.messagingService.findByConsultation(consultationId);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => MessageModel)
  sendMessage(@CurrentUser() user: any, @Args('input') input: SendMessageInput) {
    return this.messagingService.send(user.id, user.role, input);
  }

  @Subscription(() => MessageModel, {
    filter: (payload, variables) =>
      payload.newMessage.consultationId === variables.consultationId,
  })
  newMessage(@Args('consultationId', { type: () => ID }) consultationId: string) {
    return this.messagingService.subscribeToNewMessages(consultationId);
  }
}
