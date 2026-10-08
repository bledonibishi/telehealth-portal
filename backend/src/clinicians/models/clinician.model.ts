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

  @Field({ nullable: true, description: 'Shown to patients, e.g. "Endocrinologist"' })
  specialty?: string;

  @Field({ nullable: true, description: 'A line or two about their experience, shown to patients' })
  bio?: string;

  @Field(() => [String], { description: 'Languages they speak with patients' })
  languages: string[];

  @Field()
  createdAt: Date;
}
