import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class VerifyClinicianInput {
  @Field(() => ID)
  clinicianId: string;

  @Field()
  licenseNumber: string;

  @Field({ description: 'Body that issued the licence, e.g. the national chamber of physicians' })
  licensingBody: string;
}
