import { ObjectType, Field, ID } from '@nestjs/graphql';
import { CheckInStatus } from '../../common/enums';
import { QuizAnswerType } from '../../consultations/models/consultation.model';

@ObjectType('CheckIn')
export class CheckInModel {
  @Field(() => ID)
  id: string;

  @Field(() => CheckInStatus)
  status: CheckInStatus;

  @Field()
  dueAt: Date;

  @Field()
  createdAt: Date;

  @Field({ nullable: true })
  sentAt?: Date;

  @Field({ nullable: true })
  tokenExpiresAt?: Date;

  @Field({ nullable: true })
  completedAt?: Date;

  @Field({ nullable: true })
  wantsToReorder?: boolean;

  @Field(() => [QuizAnswerType], { nullable: true })
  answers?: QuizAnswerType[];

  @Field({ nullable: true })
  patientFirstName?: string;

  @Field({ nullable: true, description: 'The link the patient uses to complete their check-in. Only set while a check-in is SENT and awaiting a response.' })
  checkInUrl?: string;
}
