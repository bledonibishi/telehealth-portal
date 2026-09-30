import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { CliniciansService } from './clinicians.service';
import { ClinicianModel } from './models/clinician.model';
import { VerifyClinicianInput } from './dto/verify-clinician.input';
import { ClinicianRole } from '../common/enums';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/access-roles';

@Resolver(() => ClinicianModel)
export class CliniciansResolver {
  constructor(private cliniciansService: CliniciansService) {}

  @Authorized(ClinicianRole.ADMIN)
  @Query(() => [ClinicianModel])
  clinicians() {
    return this.cliniciansService.findAll();
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => ClinicianModel)
  updateClinicianRole(
    @CurrentUser() user: AuthUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('role', { type: () => ClinicianRole }) role: ClinicianRole,
  ) {
    return this.cliniciansService.updateRole(user.id, id, role);
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => ClinicianModel, { description: 'Record a checked medical licence; required before the clinician can prescribe' })
  verifyClinician(@CurrentUser() user: AuthUser, @Args('input') input: VerifyClinicianInput) {
    return this.cliniciansService.verify(user.id, input);
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => ClinicianModel)
  revokeClinicianVerification(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.cliniciansService.revokeVerification(user.id, id);
  }
}
