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
