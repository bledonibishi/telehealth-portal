import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { SymptomsService } from './symptoms.service';
import { SymptomAssessmentModel, SymptomScaleModel } from './models/symptoms.model';
import { RecordSymptomsInput } from './dto/record-symptoms.input';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuditRead } from '../audit/audit-read.interceptor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, CLINICAL_STAFF } from '../auth/access-roles';
import { SymptomScale } from '../common/enums';

@Resolver(() => SymptomAssessmentModel)
export class SymptomsResolver {
  constructor(private symptoms: SymptomsService) {}

  @Authorized('PATIENT')
  @Query(() => SymptomScaleModel, { nullable: true, description: 'The symptom questionnaire for the signed-in patient’s programme. Null when it has none.' })
  mySymptomScale(@CurrentUser() user: AuthUser) {
    return this.symptoms.scaleFor(user.id);
  }

  @Authorized('PATIENT')
  @Query(() => [SymptomAssessmentModel], { description: 'The signed-in patient’s symptom scores on their current programme’s scale, oldest first' })
  mySymptomAssessments(@CurrentUser() user: AuthUser) {
    return this.symptoms.ownHistory(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => SymptomAssessmentModel, { description: 'Save a filled-in symptom questionnaire. Replaces one saved in the last 24 hours.' })
  recordMySymptoms(@CurrentUser() user: AuthUser, @Args('input') input: RecordSymptomsInput) {
    return this.symptoms.record(user.id, input.answers);
  }

  @Authorized(...CLINICAL_STAFF)
  @Query(() => SymptomScaleModel, { description: 'A symptom questionnaire’s wording, for showing a patient’s item-by-item answers' })
  symptomScaleDefinition(@Args('scale', { type: () => SymptomScale }) scale: SymptomScale) {
    return this.symptoms.definition(scale);
  }

  @Authorized(...CLINICAL_STAFF)
  @AuditRead('Patient', 'patientId')
  @Query(() => [SymptomAssessmentModel], { description: 'A patient’s symptom scores, oldest first' })
  patientSymptomAssessments(@Args('patientId', { type: () => ID }) patientId: string) {
    return this.symptoms.history(patientId);
  }
}
