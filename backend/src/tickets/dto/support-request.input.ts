import { Field, ID, InputType } from '@nestjs/graphql';
import { TicketType } from '../../common/enums';

@InputType()
export class SupportRequestInput {
  @Field()
  subject: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => [ID], { nullable: true, description: 'Files uploaded as SUPPORT_ATTACHMENT to send with the request (at most 3)' })
  attachmentIds?: string[];

  @Field(() => TicketType, { description: 'What it is about; CLINICAL is a medical question for the doctors' })
  type: TicketType;
}
