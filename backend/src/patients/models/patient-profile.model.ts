import { Field, Float, ID, InputType, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Gender } from '@prisma/client';

registerEnumType(Gender, { name: 'Gender' });
export { Gender };

@ObjectType('PatientProfile', { description: 'The signed-in patient’s own details, as shown on their profile' })
export class PatientProfileModel {
  @Field(() => ID)
  id: string;

  @Field({ description: 'A short reference the patient can quote to support, e.g. "#HH-2487"' })
  patientNumber: string;

  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field()
  email: string;

  @Field()
  dateOfBirth: Date;

  @Field(() => Gender, { nullable: true })
  gender?: Gender | null;

  @Field(() => Float, { nullable: true, description: 'What the patient set, or else their intake answer' })
  heightCm?: number | null;

  @Field({ description: 'heightCm is still the intake answer' })
  heightFromIntake: boolean;

  @Field({ nullable: true })
  phone?: string | null;

  @Field({ nullable: true })
  addressLine1?: string | null;

  @Field({ nullable: true })
  addressLine2?: string | null;

  @Field({ nullable: true })
  city?: string | null;

  @Field({ nullable: true })
  postcode?: string | null;

  @Field({ nullable: true })
  country?: string | null;

  @Field({ nullable: true, description: 'Allergies the patient has noted on their profile' })
  allergies?: string | null;

  @Field({ nullable: true })
  emergencyContactName?: string | null;

  @Field({ nullable: true })
  emergencyContactPhone?: string | null;

  @Field({ description: 'Identity and onboarding were approved by the clinical team' })
  verified: boolean;

  @Field({ nullable: true })
  memberSince?: Date | null;
}

@InputType()
export class UpdateMyProfileInput {
  @Field(() => Gender, { nullable: true })
  gender?: Gender;

  @Field(() => Float, { nullable: true })
  heightCm?: number;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true, description: 'Empty string clears it' })
  allergies?: string;

  @Field({ nullable: true, description: 'Empty string clears it' })
  emergencyContactName?: string;

  @Field({ nullable: true, description: 'Empty string clears it' })
  emergencyContactPhone?: string;
}
