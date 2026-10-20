import { Resolver, Query, Mutation, Args, ID, ResolveField, Parent, Context } from '@nestjs/graphql';
import { LeadsService } from './leads.service';
import { LeadModel, PreviousAssessmentModel, ReturnOfferModel, ReturnSubscriptionModel } from './models/lead.model';
import { PreviousAssessmentInput } from './dto/previous-assessment.input';
import { CreateLeadInput } from './dto/create-lead.input';
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

  // How far through the website they got, from what has been saved so far.
  @ResolveField(() => String)
  stage(@Parent() lead: LeadModel & { checkoutDetails?: unknown }) {
    if (lead.convertedAt) return 'PAID';
    if (lead.checkoutDetails && Object.keys(lead.checkoutDetails as object).length > 0) return 'AT_CHECKOUT';
    return lead.intakeSavedAt ? 'HEALTH_ANSWERED' : 'QUIZ';
  }

  @ResolveField(() => String, { nullable: true })
  treatment(@Parent() lead: LeadModel) {
    const answers = Array.isArray(lead.quizAnswers) ? lead.quizAnswers : [];
    const pick = (id: string) => answers.find((a) => a.questionId === id)?.answer;
    return pick('preferred_treatment') ?? pick('preferred_medication') ?? null;
  }

  @ResolveField(() => String, { nullable: true })
  deliveryCity(@Parent() lead: { checkoutDetails?: { city?: string } | null }) {
    return lead.checkoutDetails?.city ?? null;
  }

  @ResolveField(() => String, { nullable: true })
  deliveryCountry(@Parent() lead: { checkoutDetails?: { country?: string } | null }) {
    return lead.checkoutDetails?.country ?? null;
  }

  // Public: the email proof in the input is what guards these two (see EmailVerificationService).
  @Query(() => PreviousAssessmentModel, { nullable: true, description: 'The answers a returning visitor gave before and never paid on, to compare with today’s. Needs the email proof.' })
  previousAssessment(@Args('input') input: PreviousAssessmentInput) {
    return this.leadsService.previousAssessment(input);
  }

  @Query(() => ReturnOfferModel, { nullable: true, description: 'For a patient refunded on their first order whose prescription is still valid: what to order, and where to pay. Needs the email proof.' })
  returnOffer(@Args('input') input: PreviousAssessmentInput) {
    return this.leadsService.returnOffer(input);
  }

  @Mutation(() => ReturnSubscriptionModel, { nullable: true, description: 'Chooses to subscribe instead of paying once: the payment for the first month. Needs the email proof.' })
  returnSubscription(@Args('input') input: PreviousAssessmentInput) {
    return this.leadsService.returnSubscription(input);
  }

  @Mutation(() => LeadModel, { description: 'Go on with the answers saved earlier instead of answering again. Needs the email proof.' })
  resumeLead(@Args('input') input: PreviousAssessmentInput) {
    return this.leadsService.resumeLead(input);
  }

  // Public — called from /website after quiz completion (before payment)
  @Mutation(() => LeadModel)
  createLead(@Args('input') input: CreateLeadInput, @Context() ctx: any) {
    return this.leadsService.upsert(input, { ip: ctx.req?.ip, userAgent: ctx.req?.headers?.['user-agent'] });
  }
}
