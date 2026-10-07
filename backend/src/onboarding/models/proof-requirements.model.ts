import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType('ProofRequirements', {
  description: 'What the patient’s prescription proof has to show to be accepted, from their account and questionnaire answers',
})
export class ProofRequirementsModel {
  @Field({ nullable: true, description: 'Their full name, as on their account' })
  name?: string;

  @Field({ nullable: true, description: 'The medicine they said they used, e.g. "Mounjaro"' })
  medicine?: string;

  @Field({ nullable: true, description: 'The dose they said they were on, e.g. "2.5 mg"' })
  dose?: string;

  @Field({ description: 'YYYY-MM-DD: the oldest dispensing, prescribing or order date that still counts' })
  notBefore: string;
}
