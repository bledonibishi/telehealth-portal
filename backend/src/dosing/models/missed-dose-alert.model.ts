import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

@ObjectType('MissedDoseAlert', { description: 'A patient on a stepped-up GLP-1 dose who has not taken several doses in a row' })
export class MissedDoseAlertModel {
  @Field(() => ID)
  patientId: string;

  @Field()
  patientName: string;

  @Field()
  productName: string;

  @Field()
  strengthLabel: string;

  @Field(() => Int)
  titrationStep: number;

  @Field(() => Int)
  missedInARow: number;

  @Field({ description: 'The first dose of the current run not taken' })
  missedSince: Date;

  @Field({ nullable: true })
  lastTakenAt?: Date;
}

@ObjectType('MissedDoseStatus', { description: 'The signed-in patient’s own run of GLP-1 doses not taken, on their active prescription' })
export class MissedDoseStatusModel {
  @Field(() => Int)
  missedInARow: number;

  @Field({ description: 'They should talk to their clinician before the next injection' })
  needsClinician: boolean;
}
