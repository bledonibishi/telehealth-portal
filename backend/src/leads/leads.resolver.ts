import { Resolver, Query, Mutation, Args, ID, ResolveField, Parent, Context } from '@nestjs/graphql';
import { LeadsService } from './leads.service';
import { LeadModel } from './models/lead.model';
import { CreateLeadInput } from './dto/create-lead.input';
import { SaveLeadIntakeInput } from './dto/save-lead-intake.input';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { SALES } from '../auth/access-roles';
import { RiskTag } from '../common/enums';
import { triageEligibility } from '../questionnaires/triage';

@Resolver(() => LeadModel)
export class LeadsResolver {
  constructor(private leadsService: LeadsService) {}

  @Authorized(...SALES)
  @Query(() => [LeadModel])
  leads() {
    return this.leadsService.findAll();
  }

  @Authorized(...SALES)
  @Query(() => LeadModel)
  lead(@Args('id', { type: () => ID }) id: string) {
    return this.leadsService.findById(id);
  }

  // The tag is worked out from the stored answers each time, so it always follows the current questionnaire.
  @ResolveField(() => RiskTag)
  riskTag(@Parent() lead: LeadModel) {
    return triageEligibility(lead.productKind, lead.quizAnswers).riskTag;
  }

  @ResolveField(() => [String])
  riskReasons(@Parent() lead: LeadModel) {
    return triageEligibility(lead.productKind, lead.quizAnswers).reasons;
  }

  // Public — called from /website after quiz completion (before payment)
  @Mutation(() => LeadModel)
  createLead(@Args('input') input: CreateLeadInput) {
    return this.leadsService.upsert(input);
  }

  // Public — called from /website after a treatment is chosen, before payment.
  @Mutation(() => Boolean, { description: 'Save the medical questionnaire answered on the website; it becomes the consultation once the first payment succeeds' })
  saveLeadIntake(@Args('input') input: SaveLeadIntakeInput, @Context() ctx: any) {
    return this.leadsService.saveIntake(input, { ip: ctx.req?.ip, userAgent: ctx.req?.headers?.['user-agent'] });
  }
}
