import { Resolver, Mutation, Args, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService, LoginAttempt } from './auth.service';
import { LoginInput } from './dto/login.input';
import { AuthResponse, MfaSetupResponse, RefreshResponse } from './dto/auth-response.type';
import { ThrottleLoginAttempts } from './guards/gql-throttler.guard';
import { Authorized } from './decorators/authorized.decorator';
import { STAFF } from './access-roles';
import { CurrentUser } from './decorators/current-user.decorator';

function loginAttempt(ctx: any): LoginAttempt {
  return { ip: ctx.req?.ip, userAgent: ctx.req?.headers?.['user-agent'] };
}

@Resolver()
export class AuthResolver {
  constructor(private authService: AuthService) {}

  @ThrottleLoginAttempts()
  @Mutation(() => AuthResponse)
  loginClinician(@Args('input') input: LoginInput, @Context() ctx: any) {
    return this.authService.loginClinician(input.email, input.password, loginAttempt(ctx));
  }

  @ThrottleLoginAttempts()
  @Mutation(() => AuthResponse)
  loginPatient(@Args('input') input: LoginInput, @Context() ctx: any) {
    return this.authService.loginPatient(input.email, input.password, loginAttempt(ctx));
  }

  @ThrottleLoginAttempts()
  @Mutation(() => AuthResponse)
  verifyMfa(
    @Args('pendingToken') pendingToken: string,
    @Args('totpCode') totpCode: string,
    @Context() ctx: any,
  ) {
    return this.authService.verifyMfa(pendingToken, totpCode, loginAttempt(ctx));
  }

  @Mutation(() => RefreshResponse)
  refreshAccessToken(@Args('refreshToken') refreshToken: string) {
    return this.authService.refreshAccessToken(refreshToken);
  }

  @Authorized(...STAFF)
  @Mutation(() => MfaSetupResponse)
  setupMfa(@CurrentUser() user: any) {
    return this.authService.setupMfa(user.id);
  }

  @Authorized(...STAFF)
  @Mutation(() => Boolean)
  enableMfa(@CurrentUser() user: any, @Args('totpCode') totpCode: string) {
    return this.authService.enableMfa(user.id, totpCode);
  }
}
