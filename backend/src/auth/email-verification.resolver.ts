import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { EmailVerificationService } from './email-verification.service';
import { RequestEmailCodeInput, VerifyEmailCodeInput } from './dto/email-verification.input';
import { ThrottleRequests } from './guards/gql-throttler.guard';

// Public: used by the website quiz before anyone has an account. Both are limited per email and per address.
@Resolver()
export class EmailVerificationResolver {
  constructor(private verification: EmailVerificationService) {}

  @ThrottleRequests()
  @Mutation(() => Boolean, { description: 'Email a six-digit code to the address given in the quiz' })
  async requestEmailCode(@Args('input') input: RequestEmailCodeInput) {
    await this.verification.requestCode(input.email);
    return true;
  }

  @ThrottleRequests()
  @Mutation(() => String, { description: 'Check the code; returns the proof createLead needs for this email' })
  verifyEmailCode(@Args('input') input: VerifyEmailCodeInput) {
    return this.verification.verifyCode(input.email, input.code);
  }
}
