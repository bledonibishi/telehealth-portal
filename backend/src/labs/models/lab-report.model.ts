import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { LabReportSource, LabReportStatus, LabResultKind } from '../../common/enums';

@ObjectType('LabReport')
export class LabReportModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  patientId: string;

  @Field(() => LabReportSource)
  source: LabReportSource;

  @Field(() => LabReportStatus)
  status: LabReportStatus;

  @Field({ nullable: true, description: 'What the patient wrote with it, or the reason it was rejected' })
  note?: string;

  @Field()
  filename: string;

  @Field()
  mimeType: string;

  @Field({ description: 'Authenticated link to the file' })
  fileUrl: string;

  @Field()
  createdAt: Date;

  @Field({ nullable: true })
  handledAt?: Date;

  @Field({ description: 'How many results have been saved from it' })
  resultCount: number;
}

@ObjectType('LabReportRow')
export class LabReportRowModel {
  @Field(() => LabResultKind)
  kind: LabResultKind;

  @Field({ nullable: true })
  analyteName?: string;

  @Field(() => Float)
  value: number;

  @Field()
  unit: string;

  @Field(() => Float, { nullable: true })
  referenceLow?: number;

  @Field(() => Float, { nullable: true })
  referenceHigh?: number;

  @Field({ nullable: true, description: 'The collection date as printed, YYYY-MM-DD' })
  collectedOn?: string;

  @Field({ nullable: true })
  flaggedByLab?: boolean;

  @Field({ description: 'The same result (test, date and value) is already on the patient’s record' })
  alreadyRecorded: boolean;
}

@ObjectType('LabReportReading')
export class LabReportReadingModel {
  @Field({ description: 'COMPLETED, NOT_CONFIGURED, UNSUPPORTED_FILE or FAILED' })
  status: string;

  @Field({ nullable: true, description: 'Why it could not be read' })
  reason?: string;

  @Field({ nullable: true })
  patientNameOnReport?: string;

  @Field({ nullable: true, description: 'Whether that name is the patient’s; null when the report shows none' })
  nameMatches?: boolean;

  @Field({ nullable: true })
  labName?: string;

  @Field({ nullable: true })
  reportDate?: string;

  @Field()
  notes: string;

  @Field(() => [String], { description: 'Things to check before saving' })
  warnings: string[];

  @Field(() => [LabReportRowModel])
  results: LabReportRowModel[];
}
