import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginInput } from './dto/login.input';
import { AuthResponse, MfaSetupResponse } from './dto/auth-response.type';
import { GqlAuthGuard } from './guards/gql-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Resolver()
export class AuthResolver {
  constructor(private authService: AuthService) {}

  @Mutation(() => AuthResponse)
  loginClinician(@Args('input') input: LoginInput) {
    return this.authService.loginClinician(input.email, input.password);
  }

  @Mutation(() => AuthResponse)
  loginPatient(@Args('input') input: LoginInput) {
    return this.authService.loginPatient(input.email, input.password);
  }

  @Mutation(() => AuthResponse)
  verifyMfa(
    @Args('pendingToken') pendingToken: string,
    @Args('totpCode') totpCode: string,
  ) {
    return this.authService.verifyMfa(pendingToken, totpCode);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => MfaSetupResponse)
  setupMfa(@CurrentUser() user: any) {
    return this.authService.setupMfa(user.id);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean)
  enableMfa(@CurrentUser() user: any, @Args('totpCode') totpCode: string) {
    return this.authService.enableMfa(user.id, totpCode);
  }
}
