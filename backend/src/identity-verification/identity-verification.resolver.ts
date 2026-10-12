import { Mutation, Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/access-roles';
import { IdentityVerificationService } from './identity-verification.service';
import { IdentityVerificationModel, StartIdentityVerificationModel } from './models/identity-verification.model';

@Resolver(() => IdentityVerificationModel)
export class IdentityVerificationResolver {
  constructor(private service: IdentityVerificationService) {}

  @Authorized('PATIENT')
  @Query(() => IdentityVerificationModel)
  myIdentityVerification(@CurrentUser() user: AuthUser) {
    return this.service.getStatus(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => StartIdentityVerificationModel)
  startIdentityVerification(@CurrentUser() user: AuthUser) {
    return this.service.start(user.id);
  }
}
