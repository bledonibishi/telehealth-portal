import { ObjectType, Field, ID } from '@nestjs/graphql';
import { UserRole } from '../../common/enums';

@ObjectType('Message')
export class MessageModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  patientId: string;

  @Field(() => ID, { nullable: true, description: 'Null for messages sent before the patient had a consultation' })
  consultationId?: string | null;

  @Field()
  senderId: string;

  @Field(() => UserRole)
  senderRole: UserRole;

  @Field()
  content: string;

  @Field()
  sentAt: Date;

  @Field({ nullable: true, description: 'When the other side first read it; null until they have' })
  readAt?: Date | null;
}

@ObjectType('MessagesRead', { description: 'One side has read everything the other sent in a conversation up to now' })
export class MessagesReadModel {
  @Field(() => ID)
  consultationId: string;

  @Field({ description: 'True when the patient did the reading; false when the care team did' })
  byPatient: boolean;

  @Field()
  readAt: Date;
}
