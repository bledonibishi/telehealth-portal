import { InputType, Field, ID, Int } from '@nestjs/graphql';
import { CheckInOutcome } from '../../common/enums';
import { PrescriptionItemInput } from '../../prescriptions/dto/prescription-item.input';

@InputType()
export class ReviewCheckInInput {
  @Field(() => ID)
  checkInId: string;

  @Field(() => CheckInOutcome)
  outcome: CheckInOutcome;

  @Field({ nullable: true, description: 'Clinical note, kept on the check-in record' })
  note?: string;

  @Field({ nullable: true, description: 'Sent to the patient as a message' })
  messageToPatient?: string;

  // NEW_PRESCRIPTION only
  @Field(() => [PrescriptionItemInput], { nullable: true })
  items?: PrescriptionItemInput[];

  @Field({ nullable: true })
  notes?: string;

  @Field(() => Int, { nullable: true })
  validityDays?: number;

  @Field(() => Int, { nullable: true })
  refillsAllowed?: number;

  @Field({ nullable: true })
  overrideReason?: string;
}
