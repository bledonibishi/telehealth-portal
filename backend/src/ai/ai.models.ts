import { ObjectType, InputType, Field, ID, Int } from '@nestjs/graphql';

@ObjectType('AiBriefSource')
export class AiBriefSourceModel {
  @Field() id: string;
  @Field({ description: 'What kind of record the line comes from, e.g. Weight, Labs' }) label: string;
  @Field({ description: 'The line of the record the bullet rests on' }) text: string;
}

@ObjectType('AiBriefBullet')
export class AiBriefBulletModel {
  @Field() text: string;
  @Field({ description: 'high or normal' }) importance: string;
  @Field(() => [AiBriefSourceModel]) sources: AiBriefSourceModel[];
}

@ObjectType('AiBrief')
export class AiBriefModel {
  @Field() headline: string;
  @Field(() => [AiBriefBulletModel]) bullets: AiBriefBulletModel[];
  @Field(() => Int, { description: 'Lines the AI wrote that couldn’t be checked against the record, and so were left out' }) removed: number;
  @Field() model: string;
  @Field() generatedAt: Date;
  @Field() cached: boolean;
}

@InputType()
export class DraftReplyInput {
  @Field(() => ID) patientId: string;
  @Field(() => ID, { nullable: true, description: 'The conversation to reply in; leave out for the one from before the patient had a consultation' }) consultationId?: string;
}

@ObjectType('AiReplyDraft')
export class AiReplyDraftModel {
  @Field() draft: string;
  @Field({ description: 'sq, en, de, es or other' }) language: string;
  @Field({ description: 'The patient asked something a clinician should answer' }) needsClinician: boolean;
  @Field() reason: string;
}

@ObjectType('AiTranslation')
export class AiTranslationModel {
  @Field() text: string;
  @Field({ description: 'The language the message was written in: sq, en, de, es or other' }) sourceLanguage: string;
  @Field() cached: boolean;
}

@ObjectType('AiPatientSearch')
export class AiPatientSearchModel {
  @Field(() => String, { nullable: true }) programme?: string;
  @Field(() => String, { nullable: true }) status?: string;
  @Field(() => String, { nullable: true }) reviewStatus?: string;
  @Field(() => String, { nullable: true }) bmiRange?: string;
  @Field(() => String, { nullable: true }) joined?: string;
  @Field(() => String, { nullable: true }) quick?: string;
  @Field(() => String, { nullable: true }) medication?: string;
  @Field(() => String, { nullable: true }) text?: string;
  @Field(() => [String], { description: 'Parts of the request no filter can express' }) unsupported: string[];
}

@ObjectType('UrgentMessage')
export class UrgentMessageModel {
  @Field(() => ID) messageId: string;
  @Field(() => String, { nullable: true }) reason?: string;
  @Field() sentAt: Date;
  @Field(() => Date, { nullable: true }) readAt?: Date;
}
