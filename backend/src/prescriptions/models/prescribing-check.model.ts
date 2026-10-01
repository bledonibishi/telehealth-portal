import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType('PrescribingViolation')
export class PrescribingViolationModel {
  @Field()
  code: string;

  @Field()
  message: string;

  @Field({ description: 'The prescriber may proceed by recording a reason' })
  overridable: boolean;
}
