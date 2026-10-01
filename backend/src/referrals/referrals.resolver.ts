import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ReferralsService } from './referrals.service';
import { MyReferralModel } from './models/referral.model';
import { VoucherModel } from './models/voucher.model';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/access-roles';

@Resolver(() => MyReferralModel)
export class ReferralsResolver {
  constructor(private referralsService: ReferralsService) {}

  @Authorized('PATIENT')
  @Query(() => MyReferralModel, { description: "The authenticated patient's referral link, rewards, and referral history" })
  myReferral(@CurrentUser() user: AuthUser) {
    return this.referralsService.myRewards(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => MyReferralModel, { description: 'Toggles whether new rewards are credited automatically or left for the patient to apply themselves' })
  setVoucherAutoApply(@CurrentUser() user: AuthUser, @Args('autoApply') autoApply: boolean) {
    return this.referralsService.setVoucherAutoApply(user.id, autoApply);
  }

  @Authorized('PATIENT')
  @Mutation(() => VoucherModel, { description: "Manually applies one of the patient's own unapplied vouchers" })
  applyVoucher(@CurrentUser() user: AuthUser, @Args('voucherId', { type: () => ID }) voucherId: string) {
    return this.referralsService.applyVoucher(voucherId, user.id);
  }
}
