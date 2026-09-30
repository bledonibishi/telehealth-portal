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
  licenseNumber?: string;

  @Field({ nullable: true })
  licensingBody?: string;

  @Field(() => ClinicianRole)
  role: ClinicianRole;

  @Field()
  isVerified: boolean;

  @Field({ nullable: true })
  verifiedAt?: Date;

  @Field()
  mfaEnabled: boolean;

  @Field()
  createdAt: Date;
}
