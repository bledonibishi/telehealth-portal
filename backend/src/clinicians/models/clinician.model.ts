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

  @Field({ nullable: true, description: 'Set when an admin turned the account off. It cannot sign in; its history stays.' })
  deactivatedAt?: Date;

  @Field({ description: 'Invited and has not chosen a password yet' })
  invitePending: boolean;

  @Field({ nullable: true, description: 'When the link they were sent stops working, while one is outstanding' })
  inviteExpiresAt?: Date;

  @Field({ nullable: true, description: 'Shown to patients, e.g. "Endocrinologist"' })
  specialty?: string;

  @Field({ nullable: true, description: 'A line or two about their experience, shown to patients' })
  bio?: string;

  @Field(() => [String], { description: 'Languages they speak with patients' })
  languages: string[];

  @Field()
  createdAt: Date;
}

@ObjectType('ClinicianInviteResult')
export class ClinicianInviteResultModel {
  @Field(() => ClinicianModel)
  clinician: ClinicianModel;

  @Field({ description: 'The email was accepted by the mail provider' })
  emailSent: boolean;

  @Field({ nullable: true, description: 'Only when the email did not go out: the single-use link, for the admin to pass on themselves' })
  inviteUrl?: string;
}
