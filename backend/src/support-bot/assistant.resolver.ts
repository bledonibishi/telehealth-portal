import { Args, Field, ID, InputType, Int, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/access-roles';
import { ClinicianRole } from '../common/enums';
import { AssistantReviewService, type Rating } from './assistant-review.service';
import { SupportArticlesService } from './support-articles.service';

@ObjectType('AssistantAnswer')
class AssistantAnswerModel {
  @Field(() => ID) id: string;
  @Field() content: string;
  @Field() sentAt: Date;
  @Field() patientName: string;
  @Field() articleId: string;
  @Field() articleTitle: string;
  @Field(() => String, { nullable: true, description: 'GOOD or BAD, once the team has rated it' }) rating: string | null;
  @Field(() => String, { nullable: true }) ratingNote: string | null;
}

@ObjectType('AssistantHandover')
class AssistantHandoverModel {
  @Field(() => ID) id: string;
  @Field(() => ID) patientId: string;
  @Field() patientName: string;
  @Field() reason: string;
  @Field() at: Date;
  @Field(() => ID, { nullable: true }) ticketId: string | null;
  @Field(() => Int, { nullable: true }) ticketNumber: number | null;
  @Field(() => String, { nullable: true }) ticketSubject: string | null;
}

@ObjectType('AssistantReview')
class AssistantReviewModel {
  @Field(() => Int) days: number;
  @Field(() => Int, { description: 'Answers it gave from a help article' }) answers: number;
  @Field(() => Int) ratedGood: number;
  @Field(() => Int) ratedBad: number;
  @Field(() => Int, { description: 'Conversations it passed to a person' }) handedOver: number;
  @Field(() => Int, { description: 'Conversations the patient said were solved' }) resolvedByAssistant: number;
  @Field(() => [AssistantAnswerModel]) recentAnswers: AssistantAnswerModel[];
  @Field(() => [AssistantHandoverModel]) recentHandovers: AssistantHandoverModel[];
}

@ObjectType('SupportArticle')
class SupportArticleModel {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field() body: string;
  @Field() handoff: boolean;
  @Field() active: boolean;
  @Field() updatedAt: Date;
}

@InputType()
class SupportArticleInput {
  @Field(() => ID, { description: 'A short name: lowercase letters, numbers and dashes' }) id: string;
  @Field() title: string;
  @Field() body: string;
  @Field({ nullable: true }) handoff?: boolean;
}

// Support and admins look after the assistant. Doctors do not edit what it says to patients.
const TEAM = [ClinicianRole.ADMIN, ClinicianRole.CX_TEAM] as const;

@Resolver()
export class AssistantResolver {
  constructor(
    private review: AssistantReviewService,
    private articles: SupportArticlesService,
  ) {}

  @Authorized(...TEAM)
  @Query(() => AssistantReviewModel, { description: 'How the automated assistant is doing: its answers, ratings and the conversations it handed over' })
  assistantReview(@Args('days', { type: () => Int, nullable: true }) days?: number) {
    return this.review.review(days ?? 30);
  }

  @Authorized(...TEAM)
  @Mutation(() => AssistantAnswerModel, { description: 'Says whether one of the assistant’s answers was right (GOOD or BAD)' })
  async rateAssistantAnswer(@CurrentUser() user: AuthUser, @Args('messageId', { type: () => ID }) messageId: string, @Args('rating') rating: string, @Args('note', { nullable: true }) note?: string) {
    const m = await this.review.rate(user, messageId, rating as Rating, note);
    return { id: m.id, content: m.content, sentAt: m.sentAt, patientName: '', articleId: m.aiArticleId ?? '', articleTitle: '', rating: m.aiFeedback, ratingNote: m.aiFeedbackNote };
  }

  @Authorized(...TEAM)
  @Query(() => [SupportArticleModel], { description: 'Everything the assistant may tell a patient' })
  supportArticles() {
    return this.articles.list();
  }

  @Authorized(...TEAM)
  @Mutation(() => SupportArticleModel)
  saveSupportArticle(@CurrentUser() user: AuthUser, @Args('input') input: SupportArticleInput) {
    return this.articles.save(user, input);
  }

  @Authorized(...TEAM)
  @Mutation(() => SupportArticleModel, { description: 'Switches an article on or off: the assistant only answers from the ones that are on' })
  setSupportArticleActive(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string, @Args('active') active: boolean) {
    return this.articles.setActive(user, id, active);
  }
}
