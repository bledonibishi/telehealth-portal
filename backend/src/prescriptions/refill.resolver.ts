import { Mutation, Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/access-roles';
import { RefillService } from './refill.service';
import { SupplyStatusModel } from './models/supply-status.model';
import { TreatmentPlanService } from './treatment-plan.service';
import { TreatmentPlanModel } from './models/treatment-plan.model';

@Resolver()
export class RefillResolver {
  constructor(
    private refill: RefillService,
    private plans: TreatmentPlanService,
  ) {}

  @Authorized('PATIENT')
  @Query(() => TreatmentPlanModel, { nullable: true, description: 'The active treatment as a plan; null without an active prescription' })
  myTreatmentPlan(@CurrentUser() user: AuthUser) {
    return this.plans.forPatient(user.id);
  }

  // The patient id always comes from the token, never an argument.
  @Authorized('PATIENT')
  @Query(() => SupplyStatusModel, { description: 'Subscription status, when the next supply is due, and whether the patient can ask for it' })
  mySupplyStatus(@CurrentUser() user: AuthUser) {
    return this.refill.status(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => SupplyStatusModel, { description: 'Ask for the next supply. Tells the doctor; the order is still placed by a prescriber.' })
  requestRefill(@CurrentUser() user: AuthUser) {
    return this.refill.request(user.id);
  }
}
