import { Resolver, Query, Mutation, Args, ID, ResolveField, Parent } from '@nestjs/graphql';
import { LabsService } from './labs.service';
import { TrtMonitoringService } from './trt-monitoring.service';
import { TrtMonitoringModel, TrtMonitoringQueueEntryModel } from './models/trt-monitoring.model';
import { LabResultModel } from './models/lab-result.model';
import { RecordLabResultInput, RecordLabResultsInput } from './dto/record-lab-result.input';
import { RejectLabReportInput, SubmitLabReportInput } from './dto/lab-report.input';
import { LabReportModel, LabReportReadingModel } from './models/lab-report.model';
import { ReviewLabResultInput } from './dto/review-lab-result.input';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuditRead } from '../audit/audit-read.interceptor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, PRESCRIBERS } from '../auth/access-roles';

@Resolver(() => LabResultModel)
export class LabsResolver {
  constructor(
    private labs: LabsService,
    private trt: TrtMonitoringService,
  ) {}

  @Authorized('PATIENT')
  @Query(() => TrtMonitoringModel, { nullable: true, description: 'The signed-in patient’s testosterone blood-test schedule. Null when not on testosterone.' })
  myTrtMonitoring(@CurrentUser() user: AuthUser) {
    return this.trt.statusFor(user.id);
  }

  @Authorized(...PRESCRIBERS)
  @AuditRead('Patient', 'patientId')
  @Query(() => TrtMonitoringModel, { nullable: true, description: 'A patient’s testosterone blood-test schedule and whether repeats are on hold' })
  patientTrtMonitoring(@Args('patientId', { type: () => ID }) patientId: string) {
    return this.trt.statusFor(patientId);
  }

  @Authorized(...PRESCRIBERS)
  @Query(() => [TrtMonitoringQueueEntryModel], { description: 'Testosterone patients on hold, with a warning, or with a blood test due soon' })
  trtMonitoringQueue() {
    return this.trt.queue();
  }

  @Authorized('PATIENT')
  @Query(() => [LabResultModel], { description: "The authenticated patient's own lab history, most recent first" })
  myLabResults(@CurrentUser() user: AuthUser) {
    return this.labs.listForPatientSelf(user.id);
  }

  @Authorized(...PRESCRIBERS)
  @AuditRead('Patient', 'patientId')
  @Query(() => [LabResultModel], { description: "A patient's lab history" })
  patientLabResults(@Args('patientId', { type: () => ID }) patientId: string) {
    return this.labs.listForPatient(patientId);
  }

  @Authorized(...PRESCRIBERS)
  @Query(() => [LabResultModel], { description: 'Out-of-range results nobody has reviewed yet, oldest first' })
  flaggedLabResultQueue() {
    return this.labs.flaggedQueue();
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => LabResultModel, { description: 'Enter a new lab result for a patient' })
  recordLabResult(@CurrentUser() user: AuthUser, @Args('input') input: RecordLabResultInput) {
    return this.labs.record(user.id, input);
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => LabResultModel, { description: 'Acknowledge a lab result, with an optional clinical note' })
  reviewLabResult(@CurrentUser() user: AuthUser, @Args('input') input: ReviewLabResultInput) {
    return this.labs.review(user.id, input);
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => [LabResultModel], { description: 'Save several results at once, all or none, usually from one lab report' })
  recordLabResults(@CurrentUser() user: AuthUser, @Args('input') input: RecordLabResultsInput) {
    return this.labs.recordMany(user.id, input);
  }

  @Authorized(...PRESCRIBERS)
  @AuditRead('Patient', 'patientId')
  @Query(() => [LabReportModel], { description: 'Lab reports on a patient’s record, those waiting for their results first' })
  patientLabReports(@Args('patientId', { type: () => ID }) patientId: string) {
    return this.labs.listReports(patientId);
  }

  @Authorized('PATIENT')
  @Query(() => [LabReportModel], { description: 'The lab reports the signed-in patient has sent in, and whether each was used' })
  myLabReports(@CurrentUser() user: AuthUser) {
    return this.labs.listOwnReports(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => LabReportModel, { description: 'Send in a lab report already uploaded with kind LAB_REPORT, for the care team to enter' })
  submitMyLabReport(@CurrentUser() user: AuthUser, @Args('input') input: SubmitLabReportInput) {
    return this.labs.submitOwnReport(user.id, input);
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => LabReportModel, { description: 'Close a report that can’t be used, with a reason the patient can see' })
  rejectLabReport(@CurrentUser() user: AuthUser, @Args('input') input: RejectLabReportInput) {
    return this.labs.rejectReport(user.id, input);
  }

  @Authorized(...PRESCRIBERS)
  @Mutation(() => LabReportReadingModel, { description: 'Have the AI reader list the results on a report. Nothing is saved: a doctor checks and saves them.' })
  readLabReport(@CurrentUser() user: AuthUser, @Args('reportId', { type: () => ID }) reportId: string) {
    return this.labs.readReport(user.id, reportId);
  }

  @ResolveField(() => String, { nullable: true, description: 'Authenticated link to the lab report this result was typed from' })
  reportUrl(@Parent() result: { report?: { fileId: string } | null }) {
    return result.report ? `/uploads/${result.report.fileId}/file` : null;
  }
}
