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

  @Field()
  timestamp: Date;
}
