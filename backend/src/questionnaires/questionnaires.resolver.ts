import { Resolver, Query, Args } from '@nestjs/graphql';
import { ConsultationKind } from '../common/enums';
import { findQuestionnaire } from './definitions';
import { QuestionnaireModel, QuestionnaireStageEnum } from './questionnaire.model';

@Resolver(() => QuestionnaireModel)
export class QuestionnairesResolver {
  // Public: the questions themselves aren't sensitive, and the marketing site
  // needs the eligibility screen before anyone has an account.
  @Query(() => QuestionnaireModel)
  questionnaire(
    @Args('kind', { type: () => ConsultationKind }) kind: ConsultationKind,
    @Args('stage', { type: () => QuestionnaireStageEnum }) stage: QuestionnaireStageEnum,
  ) {
    const q = findQuestionnaire(kind, stage);
    return {
      kind: q.kind,
      stage: q.stage,
      version: q.version,
      title: q.title,
      questions: q.questions.map(({ options, ...question }) => ({
        ...question,
        options: options?.map(({ value, label, exclusive }) => ({ value, label, exclusive: exclusive ?? false })),
      })),
    };
  }
}
