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
      prescription {
        id
        medication
        dosage
        repeatsRemaining
      }
    }
  }
`;
