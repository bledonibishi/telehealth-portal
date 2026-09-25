import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CliniciansService } from './clinicians.service';
import { ClinicianModel } from './models/clinician.model';
import { ClinicianRole } from '../common/enums';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';

@Resolver(() => ClinicianModel)
export class CliniciansResolver {
  constructor(private cliniciansService: CliniciansService) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => [ClinicianModel])
  clinicians() {
    return this.cliniciansService.findAll();
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => ClinicianModel)
  updateClinicianRole(
    @Args('id', { type: () => ID }) id: string,
    @Args('role', { type: () => ClinicianRole }) role: ClinicianRole,
  ) {
    return this.cliniciansService.updateRole(id, role);
  }
}
