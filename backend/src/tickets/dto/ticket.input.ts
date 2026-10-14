import { Field, ID, InputType } from '@nestjs/graphql';
import { TicketPriority, TicketStatus, TicketType } from '../../common/enums';

@InputType()
export class CreateTicketInput {
  @Field()
  subject: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => TicketType)
  type: TicketType;

  @Field(() => TicketPriority, { nullable: true })
  priority?: TicketPriority;

  @Field(() => ID, { nullable: true })
  patientId?: string;
}

@InputType()
export class UpdateTicketInput {
  @Field(() => ID)
  id: string;

  @Field(() => TicketStatus, { nullable: true })
  status?: TicketStatus;

  @Field(() => TicketType, { nullable: true })
  type?: TicketType;

  @Field(() => TicketPriority, { nullable: true })
  priority?: TicketPriority;

  @Field(() => ID, { nullable: true, description: 'Who handles it; pass an empty string to unassign' })
  assigneeId?: string;
}

@InputType()
export class TicketFilterInput {
  @Field(() => TicketStatus, { nullable: true })
  status?: TicketStatus;

  @Field(() => TicketType, { nullable: true })
  type?: TicketType;

  @Field(() => ID, { nullable: true })
  patientId?: string;

  @Field({ nullable: true, description: 'Only tickets assigned to the caller' })
  mine?: boolean;
}
