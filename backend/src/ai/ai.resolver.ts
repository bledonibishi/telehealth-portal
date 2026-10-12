import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditRead } from '../audit/audit-read.interceptor';
import { AuthUser, CLINICAL_STAFF, PRESCRIBERS } from '../auth/access-roles';
import { AiAssistService } from './ai-assist.service';
import { CheckInBriefService } from './check-in-brief.service';
import { MessageAssistService } from './message-assist.service';
import { MessageUrgencyService } from './message-urgency.service';
import { PatientSearchService } from './patient-search.service';
import { AiBriefModel, AiPatientSearchModel, AiReplyDraftModel, AiTranslationModel, DraftReplyInput, UrgentMessageModel } from './ai.models';

@Resolver()
export class AiResolver {
  constructor(
    private ai: AiAssistService,
    private briefs: CheckInBriefService,
    private messages: MessageAssistService,
    private urgency: MessageUrgencyService,
    private search: PatientSearchService,
  ) {}

  @Authorized(...CLINICAL_STAFF)
  @Query(() => [String], { description: 'The AI helpers that are switched on: brief, reply, translate, urgency, search' })
  aiFeatures() {
    return this.ai.enabledFeatures();
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => AiBriefModel, { description: 'A short, checked brief of a completed check-in for the doctor reviewing it. Recommends nothing.' })
  generateCheckInBrief(
    @CurrentUser() user: AuthUser,
    @Args('checkInId', { type: () => ID }) checkInId: string,
    @Args('language', { defaultValue: 'en' }) language: string,
    @Args('force', { defaultValue: false }) force: boolean,
  ) {
    return this.briefs.brief(user.id, checkInId, language, force);
  }

  @Authorized(...CLINICAL_STAFF)
  @Mutation(() => AiReplyDraftModel, { description: 'A draft reply to the patient’s latest message, for a team member to edit. Nothing is sent.' })
  draftMessageReply(@CurrentUser() user: AuthUser, @Args('input') input: DraftReplyInput) {
    return this.messages.draftReply(user, input);
  }

  @Authorized(...CLINICAL_STAFF)
  @Mutation(() => AiTranslationModel, { description: 'A message translated for the reader. Nothing on the thread changes.' })
  translateMessage(@CurrentUser() user: AuthUser, @Args('messageId', { type: () => ID }) messageId: string, @Args('target') target: string) {
    return this.messages.translate(user, messageId, target);
  }

  @Authorized(...CLINICAL_STAFF)
  @Mutation(() => AiPatientSearchModel, { description: 'Turns a plain-language request into filters for the patients list. Sees only the request, never patient data.' })
  async interpretPatientSearch(@Args('query') query: string) {
    const { filters, unsupported } = await this.search.interpret(query);
    return { ...filters, unsupported };
  }

  @Authorized(...CLINICAL_STAFF)
  @AuditRead('Patient', 'patientId')
  @Query(() => [UrgentMessageModel], { description: 'A patient’s recent messages the AI check marked as possibly urgent' })
  async urgentMessages(@Args('patientId', { type: () => ID }) patientId: string) {
    return (await this.urgency.urgentMessages(patientId)).map((m) => ({ messageId: m.id, reason: m.aiUrgentReason ?? undefined, sentAt: m.sentAt, readAt: m.readAt ?? undefined }));
  }

  @Authorized(...CLINICAL_STAFF)
  @Query(() => [ID], { description: 'Patients with a message marked possibly urgent that nobody on the care team has read yet' })
  patientsWithUrgentMessages() {
    return this.urgency.patientsWithUrgent();
  }
}
