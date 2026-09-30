import { gql } from '@apollo/client';

const MY_REFERRAL_FIELDS = gql`
  fragment MyReferralFields on MyReferral {
    code
    link
    voucherAutoApply
    vouchers {
      id
      kind
      amountCents
      currency
      status
      issuedAt
      appliedAt
      note
    }
    referrals {
      id
      firstNameInitial
      status
      createdAt
      convertedAt
    }
  }
`;

export const MY_REFERRAL = gql`
  ${MY_REFERRAL_FIELDS}
  query MyReferral {
    myReferral {
      ...MyReferralFields
    }
  }
`;

export const SET_VOUCHER_AUTO_APPLY = gql`
  ${MY_REFERRAL_FIELDS}
  mutation SetVoucherAutoApply($autoApply: Boolean!) {
    setVoucherAutoApply(autoApply: $autoApply) {
      ...MyReferralFields
    }
  }
`;

export const APPLY_VOUCHER = gql`
  mutation ApplyVoucher($voucherId: ID!) {
    applyVoucher(voucherId: $voucherId) {
      id
      status
      appliedAt
      note
    }
  }
`;
