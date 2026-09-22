import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType('Patient')
export class PatientModel {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field()
  dateOfBirth: Date;

  @Field()
  createdAt: Date;
}
