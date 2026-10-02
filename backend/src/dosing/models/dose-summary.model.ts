import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType('DoseSummary', { description: 'What the patient is on now and when the next dose is due' })
export class DoseSummaryModel {
  @Field({ description: 'e.g. "Wegovy 0.25 mg"' })
  current: string;

  @Field(() => ID, { nullable: true })
  nextDoseId?: string;

  @Field({ nullable: true })
  nextDoseAt?: Date;
}
