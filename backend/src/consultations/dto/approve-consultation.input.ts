import { InputType, Field, ID, Int } from '@nestjs/graphql';
import { PrescriptionItemInput } from '../../prescriptions/dto/prescription-item.input';

@InputType()
export class ApproveConsultationInput {
  @Field(() => ID)
  consultationId: string;

  @Field(() => [PrescriptionItemInput])
  items: PrescriptionItemInput[];

  @Field({ nullable: true, description: 'Extra instructions printed on the prescription' })
  notes?: string;

  @Field(() => Int, { nullable: true, description: 'Days the prescription stays valid; defaults to 180' })
  validityDays?: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  refillsAllowed?: number;

  @Field({ nullable: true, description: 'Required when the prescription goes against an overridable prescribing rule' })
  overrideReason?: string;
}
