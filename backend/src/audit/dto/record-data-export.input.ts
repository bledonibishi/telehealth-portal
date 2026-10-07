import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class RecordDataExportInput {
  @Field({ description: 'Which table was exported, e.g. "patients"' })
  resource: string;

  @Field(() => Int)
  rowCount: number;
}
