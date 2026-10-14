import { Args, Field, ID, InputType, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/access-roles';
import { ClinicianRole } from '../common/enums';
import { SavedRepliesService } from './saved-replies.service';

@ObjectType('SavedReply')
class SavedReplyModel {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field({ description: 'The text; {name} is replaced by the patient’s first name when it is used' }) body: string;
}

@InputType()
class SavedReplyInput {
  @Field(() => ID, { nullable: true, description: 'Omit to create a new one' }) id?: string;
  @Field() title: string;
  @Field() body: string;
}

@Resolver()
export class SavedRepliesResolver {
  constructor(private replies: SavedRepliesService) {}

  @Authorized(ClinicianRole.ADMIN, ClinicianRole.CX_TEAM, ClinicianRole.DOCTOR)
  @Query(() => [SavedReplyModel], { description: 'Ready-made answers for replying to patients' })
  savedReplies() {
    return this.replies.list();
  }

  @Authorized(ClinicianRole.ADMIN, ClinicianRole.CX_TEAM)
  @Mutation(() => SavedReplyModel)
  saveSavedReply(@CurrentUser() user: AuthUser, @Args('input') input: SavedReplyInput) {
    return this.replies.save(user, input);
  }

  @Authorized(ClinicianRole.ADMIN, ClinicianRole.CX_TEAM)
  @Mutation(() => Boolean)
  removeSavedReply(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.replies.remove(user, id);
  }
}
