import { ObjectType, Field, ID } from '@nestjs/graphql';
import { ReferralStatus } from '../../common/enums';
import { VoucherModel } from './voucher.model';

// A friend a patient referred, as shown back to that patient — deliberately
// exposes only a first-name initial and status, never the friend's email.
@ObjectType('ReferredFriend')
export class ReferredFriendModel {
  @Field(() => ID)
  id: string;

  @Field()
  firstNameInitial: string;

  @Field(() => ReferralStatus)
  status: ReferralStatus;

  @Field()
  createdAt: Date;

  @Field({ nullable: true })
  convertedAt?: Date;
}

@ObjectType('MyReferral')
export class MyReferralModel {
  @Field()
  code: string;

  @Field()
  link: string;

  @Field()
  voucherAutoApply: boolean;

  @Field(() => [VoucherModel])
  vouchers: VoucherModel[];

  @Field(() => [ReferredFriendModel])
  referrals: ReferredFriendModel[];
}
