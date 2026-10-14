import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { TicketPriority, TicketStatus, TicketType } from '../../common/enums';

@ObjectType('TicketAttachment')
export class TicketAttachmentModel {
  @Field(() => ID)
  id: string;

  @Field()
  filename: string;

  @Field()
  mimeType: string;

  @Field()
  createdAt: Date;
}

@ObjectType('TicketNote')
export class TicketNoteModel {
  @Field(() => ID)
  id: string;

  @Field()
  authorName: string;

  @Field()
  body: string;

  @Field()
  createdAt: Date;
}

@ObjectType('Ticket')
export class TicketModel {
  @Field(() => ID)
  id: string;

  @Field(() => Int, { description: 'The short number people say out loud' })
  number: number;

  @Field(() => TicketType)
  type: TicketType;

  @Field(() => TicketStatus)
  status: TicketStatus;

  @Field(() => TicketPriority)
  priority: TicketPriority;

  @Field()
  subject: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => ID, { nullable: true })
  patientId?: string;

  @Field({ nullable: true })
  patientName?: string;

  @Field(() => ID, { nullable: true })
  assigneeId?: string;

  @Field({ nullable: true })
  assigneeName?: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field({ nullable: true, description: 'When a person first picked it up' })
  firstResponseAt?: Date;

  @Field({ nullable: true, description: 'When the first reply is due, by priority; empty once someone has replied or it is finished' })
  replyDueAt?: Date;

  @Field({ nullable: true })
  resolvedAt?: Date;

  @Field({ nullable: true, description: 'When support passed this to the engineers' })
  engineeringSentAt?: Date;

  @Field({ nullable: true })
  engineeringSentByName?: string;

  @Field({ nullable: true, description: 'What support wrote for the engineers' })
  engineeringNote?: string;

  @Field({ nullable: true, description: 'When support marked the engineers as done with it' })
  engineeringDoneAt?: Date;

  @Field(() => [TicketNoteModel], { description: 'Internal notes, oldest first. Never shown to the patient.' })
  notes: TicketNoteModel[];

  @Field(() => [TicketAttachmentModel], { description: 'Files the patient attached to the request' })
  attachments: TicketAttachmentModel[];
}

/** A ticket as its patient sees it: nothing internal. */
@ObjectType('SupportRequest')
export class SupportRequestModel {
  @Field(() => ID)
  id: string;

  @Field(() => Int)
  number: number;

  @Field(() => TicketType)
  type: TicketType;

  @Field(() => TicketStatus)
  status: TicketStatus;

  @Field()
  subject: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  createdAt: Date;

  @Field({ nullable: true })
  resolvedAt?: Date;

  @Field(() => [TicketAttachmentModel])
  attachments: TicketAttachmentModel[];
}
