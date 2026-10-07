import { gql } from '@apollo/client';

export const MY_ORDERS = gql`
  query MyOrders {
    myOrders {
      id
      sequence
      status
      createdAt
      dispatchedAt
      carrier
      trackingNumber
      trackingUrl
      outForDeliveryAt
      deliveredAt
      shippingAddress {
        name
        addressLine1
        addressLine2
        city
        postcode
        country
      }
      prescription {
        id
        medication
        dosage
        repeatsRemaining
      }
    }
  }
`;
