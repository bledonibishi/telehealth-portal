import { Field, ID, InputType, Int } from '@nestjs/graphql';

@InputType()
export class AuditLogFilterInput {
  @Field({ nullable: true, description: 'Part of the action name, e.g. "ORDER" or "LOGIN"' })
  action?: string;

  @Field({ nullable: true, description: 'Exact resource type, e.g. "Patient"' })
  resourceType?: string;

  @Field(() => ID, { nullable: true })
  patientId?: string;

  @Field(() => ID, { nullable: true })
  actorId?: string;

  @Field({ nullable: true })
  from?: Date;

  @Field({ nullable: true, description: 'Exclusive' })
  to?: Date;

  @Field(() => ID, { nullable: true })
  cursor?: string;

  @Field(() => Int, { nullable: true, description: 'Default 50, at most 200' })
  limit?: number;
}
