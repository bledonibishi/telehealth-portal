import { ObjectType, Field, ID } from '@nestjs/graphql';
import { UserRole } from '../../common/enums';

@ObjectType('AuditLogEntry')
export class AuditLogEntryModel {
  @Field(() => ID)
  id: string;

  @Field()
  actorId: string;

  @Field(() => String, { nullable: true, description: 'Only filled in by the audit log listing' })
  actorName?: string | null;

  @Field(() => UserRole)
  actorRole: UserRole;

  @Field()
  action: string;

  @Field()
  resourceType: string;

  @Field()
  resourceId: string;

  @Field(() => String, { nullable: true })
  patientId?: string | null;

  @Field(() => String, { nullable: true, description: 'Only filled in by the audit log listing' })
  patientName?: string | null;

  @Field(() => String, { nullable: true, description: 'What changed, as JSON text' })
  metadata?: string | null;

  @Field()
  timestamp: Date;
}

@ObjectType('AuditLogPage')
export class AuditLogPageModel {
  @Field(() => [AuditLogEntryModel])
  entries: AuditLogEntryModel[];

  @Field(() => String, { nullable: true, description: 'Pass as the cursor to get the next, older page; null on the last page' })
  nextCursor?: string | null;
}
