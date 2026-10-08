import { Resolver, Query, Mutation, Args, ID, ResolveField, Parent } from '@nestjs/graphql';
import { CliniciansService } from './clinicians.service';
import { ClinicianInviteResultModel, ClinicianModel } from './models/clinician.model';
import { CreateClinicianInput, UpdateClinicianInput } from './dto/clinician-account.input';
import { VerifyClinicianInput } from './dto/verify-clinician.input';
import { UpdateClinicianProfileInput } from './dto/update-clinician-profile.input';
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

  // The invitation token never leaves the server: the page only learns whether an invitation is outstanding.
  @ResolveField(() => Boolean)
  invitePending(@Parent() c: { passwordSetAt?: Date | null }) {
    return !c.passwordSetAt;
  }

  @ResolveField(() => Date, { nullable: true })
  inviteExpiresAt(@Parent() c: { inviteTokenExpiresAt?: Date | null }) {
    return c.inviteTokenExpiresAt ?? null;
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => ClinicianInviteResultModel, { description: 'Add a team member. They get a single-use link to choose their own password; nobody is ever given one.' })
  async createClinician(@CurrentUser() user: AuthUser, @Args('input') input: CreateClinicianInput): Promise<ClinicianInviteResultModel> {
    const { clinician, delivery } = await this.cliniciansService.create(user.id, input);
    return { clinician: clinician as unknown as ClinicianModel, ...delivery };
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => ClinicianModel, { description: 'Change a member’s name or email' })
  updateClinician(@CurrentUser() user: AuthUser, @Args('input') input: UpdateClinicianInput) {
    return this.cliniciansService.update(user.id, input);
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => ClinicianModel, { description: 'Turn an account off. Its history stays; it can no longer sign in, and open sessions stop working.' })
  deactivateClinician(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.cliniciansService.deactivate(user.id, id);
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => ClinicianModel)
  reactivateClinician(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.cliniciansService.reactivate(user.id, id);
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => ClinicianInviteResultModel, { description: 'Send a new single-use link: to finish an invitation, or for a member who lost their password' })
  async sendClinicianInvite(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string): Promise<ClinicianInviteResultModel> {
    const { clinician, delivery } = await this.cliniciansService.sendInvite(user.id, id);
    return { clinician: clinician as unknown as ClinicianModel, ...delivery };
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => Boolean, { description: 'Delete someone who was invited and never signed in. Anyone else is deactivated, so their history stays.' })
  deleteUnusedClinician(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.cliniciansService.deleteUnused(user.id, id);
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
  @Mutation(() => ClinicianModel, { description: 'What patients see about a clinician on My Doctor' })
  updateClinicianProfile(@CurrentUser() user: AuthUser, @Args('input') input: UpdateClinicianProfileInput) {
    return this.cliniciansService.updateProfile(user.id, input);
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => ClinicianModel)
  revokeClinicianVerification(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.cliniciansService.revokeVerification(user.id, id);
  }
}
