import { ObjectType, Field, ID } from '@nestjs/graphql';
import { UserRole } from '../../common/enums';

@ObjectType('AuditLogEntry')
export class AuditLogEntryModel {
  @Field(() => ID)
  id: string;

  @Field()
  actorId: string;

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

  @Field(() => String, { nullable: true, description: 'What changed, as JSON text' })
  metadata?: string | null;

  @Field()
  timestamp: Date;
}
