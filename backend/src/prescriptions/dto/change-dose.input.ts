import { InputType, Field, ID, Int } from '@nestjs/graphql';
import { PrescriptionItemInput } from './prescription-item.input';

@InputType()
export class ChangeDoseInput {
  @Field(() => ID, { description: 'The current active prescription being replaced' })
  prescriptionId: string;

  @Field(() => [PrescriptionItemInput])
  items: PrescriptionItemInput[];

  @Field({ description: 'Clinical reason for the change, kept on the audit log' })
  reasonForChange: string;

  @Field({ nullable: true, description: 'Extra instructions printed on the new prescription' })
  notes?: string;

  @Field({ nullable: true, description: 'Sent to the patient as a message' })
  messageToPatient?: string;

  @Field(() => Int, { nullable: true })
  validityDays?: number;

  @Field(() => Int, { nullable: true })
  refillsAllowed?: number;

  @Field({ nullable: true, description: 'Required when the change goes against an overridable prescribing rule' })
  overrideReason?: string;
}
