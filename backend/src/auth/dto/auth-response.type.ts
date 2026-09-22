import { ObjectType, Field } from '@nestjs/graphql';
import { ClinicianModel } from '../../clinicians/models/clinician.model';

@ObjectType()
export class AuthResponse {
  @Field({ nullable: true })
  accessToken?: string;

  @Field({ nullable: true })
  pendingToken?: string;

  @Field()
  mfaRequired: boolean;

  @Field(() => ClinicianModel, { nullable: true })
  clinician?: ClinicianModel;
}

@ObjectType()
export class MfaSetupResponse {
  @Field()
  secret: string;

  @Field()
  otpauthUrl: string;
}
