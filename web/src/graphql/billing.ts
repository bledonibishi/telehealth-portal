import { gql } from '@apollo/client';

export const CREATE_BILLING_PORTAL_SESSION = gql`
  mutation CreateBillingPortalSession {
    createBillingPortalSession {
      url
    }
  }
`;
