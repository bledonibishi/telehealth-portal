import { ObjectType, Field, ID } from '@nestjs/graphql';
import { ProductForm } from '../../common/enums';

@ObjectType('DoseSummary', { description: 'What the patient is on now and when the next dose is due' })
export class DoseSummaryModel {
  @Field({ description: 'e.g. "Wegovy 0.25 mg"' })
  current: string;

  @Field(() => ID, { nullable: true })
  nextDoseId?: string;

  @Field({ nullable: true })
  nextDoseAt?: Date;

  @Field(() => ProductForm, { nullable: true, description: 'The form of the next dose’s medicine, which can differ between the items of one prescription' })
  nextDoseForm?: ProductForm | null;
}
