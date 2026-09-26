import { InputType, Field, ID } from '@nestjs/graphql';
import { PrescriptionProofType } from '../../common/enums';

@InputType()
export class SavePrescriptionProofStepInput {
  @Field(() => PrescriptionProofType)
  prescriptionProofType: PrescriptionProofType;

  @Field(() => ID)
  prescriptionProofFileId: string;
}
