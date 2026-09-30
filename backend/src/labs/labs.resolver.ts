import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { LabsService } from './labs.service';
import { LabResultModel } from './models/lab-result.model';
import { RecordLabResultInput } from './dto/record-lab-result.input';
import { ReviewLabResultInput } from './dto/review-lab-result.input';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuditRead } from '../audit/audit-read.interceptor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, PRESCRIBERS } from '../auth/access-roles';

@Resolver(() => LabResultModel)
export class LabsResolver {
  constructor(private labs: LabsService) {}

  @Authorized('PATIENT')
  @Query(() => [LabResultModel], { description: "The authenticated patient's own lab history, most recent first" })
  myLabResults(@CurrentUser() user: AuthUser) {
    return this.labs.listForPatient(user.id);
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
}
