import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { VoucherKind, VoucherStatus } from '../../common/enums';

@ObjectType('Voucher')
export class VoucherModel {
  @Field(() => ID)
  id: string;

  @Field(() => VoucherKind)
  kind: VoucherKind;

  @Field(() => Int)
  amountCents: number;

  @Field()
  currency: string;

  @Field(() => VoucherStatus)
  status: VoucherStatus;

  @Field()
  issuedAt: Date;

  @Field({ nullable: true })
  appliedAt?: Date;

  @Field({ nullable: true })
  note?: string;
}
