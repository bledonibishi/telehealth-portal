import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards, ForbiddenException } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { ConsultationModel } from './models/consultation.model';
import { ApproveConsultationInput } from './dto/approve-consultation.input';
import { DeclineConsultationInput } from './dto/decline-consultation.input';
import { SubmitIntakeQuizInput } from './dto/submit-intake-quiz.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => ConsultationModel)
export class ConsultationsResolver {
  constructor(private consultationsService: ConsultationsService) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => [ConsultationModel], { description: 'Review queue — critical red flags pinned first, then sorted by wait time' })
  consultationQueue() {
    return this.consultationsService.findQueue();
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => ConsultationModel)
  consultation(@Args('id', { type: () => ID }) id: string) {
    return this.consultationsService.findById(id);
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => [ConsultationModel], { description: 'Prior consultations for a patient, newest first' })
  patientHistory(@Args('patientId', { type: () => ID }) patientId: string) {
    return this.consultationsService.findByPatient(patientId);
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => [ConsultationModel], { description: "The authenticated patient's own consultations" })
  myConsultations(@CurrentUser() user: any) {
    return this.consultationsService.findByPatient(user.id);
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => ConsultationModel, { description: 'A single consultation belonging to the authenticated patient' })
  async myConsultation(@CurrentUser() user: any, @Args('id', { type: () => ID }) id: string) {
    const consultation = await this.consultationsService.findById(id);
    if (consultation.patientId !== user.id) throw new ForbiddenException();
    return consultation;
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => ConsultationModel)
  submitIntakeQuiz(@CurrentUser() user: any, @Args('input') input: SubmitIntakeQuizInput) {
    return this.consultationsService.submitIntakeQuiz(user.id, input);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => ConsultationModel)
  approveConsultation(@CurrentUser() user: any, @Args('input') input: ApproveConsultationInput) {
    return this.consultationsService.approve(user.id, input);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => ConsultationModel)
  declineConsultation(@CurrentUser() user: any, @Args('input') input: DeclineConsultationInput) {
    return this.consultationsService.decline(user.id, input);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => ConsultationModel)
  requestMoreInfo(
    @CurrentUser() user: any,
    @Args('consultationId', { type: () => ID }) consultationId: string,
  ) {
    return this.consultationsService.requestMoreInfo(user.id, consultationId);
  }
}
