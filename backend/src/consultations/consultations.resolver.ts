import { Resolver, Query, Mutation, Args, ID, Context } from '@nestjs/graphql';
import { AuditRead } from '../audit/audit-read.interceptor';
import { ForbiddenException } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { ConsultationModel } from './models/consultation.model';
import { ApproveConsultationInput } from './dto/approve-consultation.input';
import { DeclineConsultationInput } from './dto/decline-consultation.input';
import { SubmitIntakeQuizInput } from './dto/submit-intake-quiz.input';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, PRESCRIBERS, STAFF } from '../auth/access-roles';
import { ClinicianRole } from '../common/enums';

const isAdmin = (user: AuthUser) => user.clinicianRole === ClinicianRole.ADMIN;

@Resolver(() => ConsultationModel)
export class ConsultationsResolver {
  constructor(private consultationsService: ConsultationsService) {}

  @Authorized(...PRESCRIBERS)
  @Query(() => [ConsultationModel], { description: 'Review queue — critical red flags pinned first, then sorted by wait time' })
  consultationQueue() {
    return this.consultationsService.findQueue();
  }

  @Authorized(...STAFF, 'PATIENT')
  @AuditRead('Consultation')
  @Query(() => ConsultationModel)
  async consultation(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    const consultation = await this.consultationsService.findById(id);
    if (user.role === 'PATIENT' && consultation.patientId !== user.id) throw new ForbiddenException();
    return consultation;
  }

  @Authorized(...STAFF)
  @AuditRead('Patient', 'patientId')
  @Query(() => [ConsultationModel], { description: 'Prior consultations for a patient, newest first' })
  patientHistory(@Args('patientId', { type: () => ID }) patientId: string) {
    return this.consultationsService.findByPatient(patientId);
  }

  @Authorized('PATIENT')
  @Query(() => [ConsultationModel], { description: "The authenticated patient's own consultations" })
  myConsultations(@CurrentUser() user: AuthUser) {
    return this.consultationsService.findByPatient(user.id);
  }

  @Authorized('PATIENT')
  @Query(() => ConsultationModel, { description: 'A single consultation belonging to the authenticated patient' })
  async myConsultation(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    const consultation = await this.consultationsService.findById(id);
    if (consultation.patientId !== user.id) throw new ForbiddenException();
    return consultation;
  }

  @Authorized('PATIENT')
  @Mutation(() => ConsultationModel)
  submitIntakeQuiz(@CurrentUser() user: AuthUser, @Args('input') input: SubmitIntakeQuizInput, @Context() ctx: any) {
    return this.consultationsService.submitIntakeQuiz(user.id, input, {
      ip: ctx.req?.ip,
      userAgent: ctx.req?.headers?.['user-agent'],
    });
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => ConsultationModel)
  approveConsultation(@CurrentUser() user: AuthUser, @Args('input') input: ApproveConsultationInput) {
    return this.consultationsService.approve(user.id, input, isAdmin(user));
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => ConsultationModel)
  declineConsultation(@CurrentUser() user: AuthUser, @Args('input') input: DeclineConsultationInput) {
    return this.consultationsService.decline(user.id, input, isAdmin(user));
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => ConsultationModel)
  requestMoreInfo(
    @CurrentUser() user: AuthUser,
    @Args('consultationId', { type: () => ID }) consultationId: string,
    @Args('message', { nullable: true, description: 'What the patient needs to tell us; sent as a message' }) message?: string,
  ) {
    return this.consultationsService.requestMoreInfo(user.id, consultationId, message, isAdmin(user));
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => ConsultationModel, { description: 'Take ownership of a consultation so no other doctor decides it at the same time' })
  claimConsultation(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.consultationsService.claim(user.id, id, isAdmin(user));
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => ConsultationModel, { description: 'Hand a claimed consultation back to the queue' })
  releaseConsultation(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.consultationsService.release(user.id, id, isAdmin(user));
  }
}
