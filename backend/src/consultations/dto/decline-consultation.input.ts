import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class DeclineConsultationInput {
  @Field(() => ID)
  consultationId: string;

  @Field({ description: 'Clinical reason, recorded on the consultation and audit log' })
  reason: string;

  @Field({ nullable: true, description: 'Sent to the patient as a message in the consultation thread' })
  messageToPatient?: string;
}
