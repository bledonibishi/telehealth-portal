import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType('Clinician')
export class ClinicianModel {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field()
  gmcNumber: string;

  @Field()
  isVerified: boolean;

  @Field()
  mfaEnabled: boolean;

  @Field()
  createdAt: Date;
}
