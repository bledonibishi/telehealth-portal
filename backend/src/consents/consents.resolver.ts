import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { ConsentType } from '../common/enums';
import { ConsentsService } from './consents.service';
import { ConsentTextModel } from './consent.model';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/access-roles';

@Resolver(() => ConsentTextModel)
export class ConsentsResolver {
  constructor(private consents: ConsentsService) {}

  // Public: it's the same text for everyone.
  @Query(() => ConsentTextModel, { description: 'The consent wording patients currently agree to' })
  consentText(@Args('type', { type: () => ConsentType }) type: ConsentType) {
    return this.consents.current(type);
  }

  @Authorized('PATIENT')
  @Query(() => Boolean, { description: 'Whether the signed-in patient has accepted the telehealth consent (on the website, in the questionnaire, or here)' })
  myTelehealthConsent(@CurrentUser() user: AuthUser) {
    return this.consents.hasAccepted(user.id, ConsentType.TELEHEALTH);
  }

  @Authorized('PATIENT')
  @Mutation(() => Boolean, { description: 'Accept the current telehealth consent wording. Safe to repeat: it is recorded once for a version.' })
  async acceptTelehealthConsent(@CurrentUser() user: AuthUser, @Args('version') version: string, @Context() ctx: any) {
    await this.consents.recordOnce(user.id, ConsentType.TELEHEALTH, version, { ip: ctx.req?.ip, userAgent: ctx.req?.headers?.['user-agent'] });
    return true;
  }
}
