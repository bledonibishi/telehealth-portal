import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser, SALES } from '../auth/access-roles';
import { CxService } from './cx.service';
import { CxWorkQueue } from './cx.model';

@Resolver()
export class CxResolver {
  constructor(private cx: CxService) {}

  @Authorized(...SALES)
  @Query(() => CxWorkQueue, { description: 'What is waiting for the CX team: replies, lead follow-ups, activations and unfinished onboarding' })
  cxWorkQueue() {
    return this.cx.workQueue();
  }

  @Authorized(...SALES)
  @Mutation(() => Boolean, { description: 'Records that the caller got in touch with an unpaid lead' })
  markLeadContacted(@CurrentUser() user: AuthUser, @Args('leadId', { type: () => ID }) leadId: string) {
    return this.cx.markLeadContacted(user.id, leadId);
  }

  @Authorized(...SALES)
  @Mutation(() => Boolean, { description: 'Closes an unpaid lead for good: not interested, or asked not to be contacted' })
  stopLeadFollowUp(@CurrentUser() user: AuthUser, @Args('leadId', { type: () => ID }) leadId: string) {
    return this.cx.stopLeadFollowUp(user.id, leadId);
  }
}
