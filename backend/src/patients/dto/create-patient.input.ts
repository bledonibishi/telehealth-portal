import { InputType, Field } from '@nestjs/graphql';
import { ConsultationKind } from '../../common/enums';
import { QuizAnswerInput } from '../../consultations/dto/submit-intake-quiz.input';

@InputType()
export class CreatePatientInput {
  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field()
  email: string;

  @Field()
  dateOfBirth: Date;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true })
  addressLine1?: string;

  @Field({ nullable: true })
  addressLine2?: string;

  @Field({ nullable: true })
  city?: string;

  @Field({ nullable: true })
  postcode?: string;

  @Field({ nullable: true })
  country?: string;

  @Field({ nullable: true, description: 'Login password. Left blank, a random one is generated and returned in temporaryPassword' })
  password?: string;

  @Field(() => ConsultationKind, { description: 'Programme to enrol the patient in' })
  plan: ConsultationKind;

  @Field({ defaultValue: true, description: 'Mark onboarding and identity verification as fully approved' })
  onboardingCompleted: boolean;

  @Field(() => [QuizAnswerInput], {
    nullable: true,
    description: "Answers to the plan's medical intake questionnaire — required when onboardingCompleted is true",
  })
  quizAnswers?: QuizAnswerInput[];

  @Field({ nullable: true, description: 'Onboarding question: has the patient used this treatment before? Affects GLP-1 starting-dose rules' })
  priorMedicationUse?: boolean;
}
