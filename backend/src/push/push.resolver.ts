import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/access-roles';
import { PushService } from './push.service';

@Resolver()
export class PushResolver {
  constructor(private push: PushService) {}

  @Authorized('PATIENT')
  @Mutation(() => Boolean, { description: 'Remember this phone so we can tell it when an order moves' })
  registerPushToken(@CurrentUser() user: AuthUser, @Args('token') token: string, @Args('platform') platform: string) {
    return this.push.register(user.id, token, platform);
  }

  @Authorized('PATIENT')
  @Mutation(() => Boolean, { description: 'Stop telling this phone (on sign out)' })
  unregisterPushToken(@CurrentUser() user: AuthUser, @Args('token') token: string) {
    return this.push.unregister(user.id, token);
  }
}
