import { gql } from '@apollo/client';

const DELIVERY_FIELDS = gql`
  fragment DeliveryFields on Patient {
    id
    phone
    addressLine1
    addressLine2
    city
    postcode
    country
  }
`;

export const ME_DELIVERY = gql`
  ${DELIVERY_FIELDS}
  query MeDelivery {
    me {
      ...DeliveryFields
    }
  }
`;

export const UPDATE_MY_DELIVERY_DETAILS = gql`
  ${DELIVERY_FIELDS}
  mutation UpdateMyDeliveryDetails($input: UpdateDeliveryDetailsInput!) {
    updateMyDeliveryDetails(input: $input) {
      ...DeliveryFields
    }
  }
`;
