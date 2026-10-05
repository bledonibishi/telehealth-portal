import { gql } from '@apollo/client';

const SUPPLY_STATUS_FIELDS = gql`
  fragment SupplyStatusFields on SupplyStatus {
    subscriptionActive
    medication
    nextSupplyAt
    daysUntilNextSupply
    repeatsLeft
    supplyBeingPrepared
    refillState
    refillOpensInDays
    refillRequestedAt
  }
`;

export const MY_SUPPLY_STATUS = gql`
  ${SUPPLY_STATUS_FIELDS}
  query MySupplyStatus {
    mySupplyStatus {
      ...SupplyStatusFields
    }
  }
`;

export const REQUEST_REFILL = gql`
  ${SUPPLY_STATUS_FIELDS}
  mutation RequestRefill {
    requestRefill {
      ...SupplyStatusFields
    }
  }
`;
