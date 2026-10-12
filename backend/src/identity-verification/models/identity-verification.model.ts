import { Field, ObjectType } from '@nestjs/graphql';
import { IdentityVerificationStatus } from '../../common/enums';

@ObjectType('IdentityVerification')
export class IdentityVerificationModel {
  /** False when verify-service is not set up; onboarding then uses the in-app upload flow. */
  @Field()
  configured: boolean;

  @Field(() => IdentityVerificationStatus, { nullable: true })
  status?: IdentityVerificationStatus | null;

  @Field({ nullable: true })
  expiresAt?: Date | null;
}

@ObjectType('StartIdentityVerificationResult')
export class StartIdentityVerificationModel {
  /** Where to send the patient. Contains a one-time token: don't store or log it. */
  @Field()
  hostedUrl: string;

  @Field()
  expiresAt: Date;
}
