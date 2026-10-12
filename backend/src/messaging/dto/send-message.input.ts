import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class SendMessageInput {
  @Field(() => ID, {
    nullable: true,
    description: 'The consultation thread. Omitted: the patient’s newest consultation, or their pre-consultation thread if they have none',
  })
  consultationId?: string | null;

  @Field(() => ID, { nullable: true, description: 'Staff only, without consultationId: the patient to write to' })
  patientId?: string | null;

  @Field()
  content: string;
}
