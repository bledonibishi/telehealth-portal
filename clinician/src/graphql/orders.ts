import { gql } from '@apollo/client';

export const GET_ORDERS = gql`
  query GetOrders {
    orders {
      id
      medication
      dosage
      instructions
      issuedAt
      pharmacyRef
      dispatchedAt
      carrier
      trackingNumber
      trackingUrl
      outForDeliveryAt
      deliveredAt
      consultation {
        id
        kind
        patient {
          id
          firstName
          lastName
          email
        }
      }
    }
  }
`;

export const DISPATCH_ORDER = gql`
  mutation DispatchOrder($id: ID!, $pharmacyRef: String!) {
    dispatchOrder(id: $id, pharmacyRef: $pharmacyRef) {
      id
      pharmacyRef
      dispatchedAt
    }
  }
`;

export const MARK_ORDER_OUT_FOR_DELIVERY = gql`
  mutation MarkOrderOutForDelivery($id: ID!, $carrier: String, $trackingNumber: String, $trackingUrl: String) {
    markOrderOutForDelivery(id: $id, carrier: $carrier, trackingNumber: $trackingNumber, trackingUrl: $trackingUrl) {
      id
      carrier
      trackingNumber
      trackingUrl
      outForDeliveryAt
    }
  }
`;

export const MARK_ORDER_DELIVERED = gql`
  mutation MarkOrderDelivered($id: ID!) {
    markOrderDelivered(id: $id) {
      id
      deliveredAt
    }
  }
`;
