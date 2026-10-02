import { ObjectType, InputType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { SideEffectSeverity } from '@prisma/client';

registerEnumType(SideEffectSeverity, { name: 'SideEffectSeverity' });
export { SideEffectSeverity };

@InputType()
export class ReportSideEffectsInput {
  @Field(() => [String], { description: 'Keys of the effects, e.g. "nausea"' })
  effects: string[];

  @Field(() => SideEffectSeverity)
  severity: SideEffectSeverity;

  @Field({ nullable: true })
  note?: string;
}

@ObjectType('SideEffectReport')
export class SideEffectReportModel {
  @Field(() => ID)
  id: string;

  @Field(() => [String])
  effects: string[];

  @Field(() => SideEffectSeverity)
  severity: SideEffectSeverity;

  @Field({ nullable: true })
  note?: string;

  @Field({ nullable: true, description: 'What the patient was on when they reported it' })
  medication?: string;

  @Field()
  createdAt: Date;

  @Field({ nullable: true })
  acknowledgedAt?: Date;

  @Field({ nullable: true, description: 'What to tell the patient right after reporting; set only when there is something to say' })
  advice?: string;
}

@ObjectType('SideEffectAlert', { description: 'A side effect a patient reported that no doctor has acknowledged yet' })
export class SideEffectAlertModel extends SideEffectReportModel {
  @Field(() => ID)
  patientId: string;

  @Field()
  patientName: string;
}
