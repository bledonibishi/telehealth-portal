import { gql } from '@apollo/client';

export const MY_ORDERS = gql`
  query MyOrders {
    myOrders {
      id
      reference
      sequence
      status
      createdAt
      dispatchedAt
      carrier
      trackingNumber
      trackingUrl
      estimatedDeliveryFrom
      estimatedDeliveryTo
      trackingEvents {
        id
        status
        occurredAt
        location
      }
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
