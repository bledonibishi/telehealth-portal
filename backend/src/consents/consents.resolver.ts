import { Resolver, Query, Args } from '@nestjs/graphql';
import { ConsentType } from '../common/enums';
import { ConsentsService } from './consents.service';
import { ConsentTextModel } from './consent.model';

@Resolver(() => ConsentTextModel)
export class ConsentsResolver {
  constructor(private consents: ConsentsService) {}

  // Public: it's the same text for everyone.
  @Query(() => ConsentTextModel, { description: 'The consent wording patients currently agree to' })
  consentText(@Args('type', { type: () => ConsentType }) type: ConsentType) {
    return this.consents.current(type);
  }
}
