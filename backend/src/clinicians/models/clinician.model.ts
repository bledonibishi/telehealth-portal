import { ObjectType, Field, ID } from '@nestjs/graphql';
import { ClinicianRole } from '../../common/enums';

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

  @Field({ nullable: true })
  gmcNumber?: string;

  @Field(() => ClinicianRole)
  role: ClinicianRole;

  @Field()
  isVerified: boolean;

  @Field()
  mfaEnabled: boolean;

  @Field()
  createdAt: Date;
}
