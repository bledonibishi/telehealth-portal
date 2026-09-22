import { ObjectType, Field, ID } from '@nestjs/graphql';
import { UserRole } from '../../common/enums';

@ObjectType('Message')
export class MessageModel {
  @Field(() => ID)
  id: string;

  @Field()
  consultationId: string;

  @Field()
  senderId: string;

  @Field(() => UserRole)
  senderRole: UserRole;

  @Field()
  content: string;

  @Field()
  sentAt: Date;
}
