import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class SubmitLabReportInput {
  @Field(() => ID, { description: 'The id returned when the file was uploaded with kind LAB_REPORT' })
  fileId: string;

  @Field({ nullable: true, description: 'Anything the patient wants their care team to know about it' })
  note?: string;
}

@InputType()
export class RejectLabReportInput {
  @Field(() => ID)
  reportId: string;

  @Field({ nullable: true, description: 'Why it can’t be used (shown to the patient)' })
  reason?: string;
}
