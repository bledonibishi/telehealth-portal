import { gql } from '@apollo/client';

export const CREATE_BILLING_PORTAL_SESSION = gql`
  mutation CreateBillingPortalSession {
    createBillingPortalSession {
      url
    }
  }
`;

export const MY_OPEN_REFUND_REQUEST = gql`
  query MyOpenRefundRequest {
    myOpenRefundRequest {
      id
      status
      requestedAt
    }
  }
`;

export const REQUEST_MY_REFUND = gql`
  mutation RequestMyRefund {
    requestMyRefund {
      id
      status
      requestedAt
    }
  }
`;

export const CANCEL_MY_SUBSCRIPTION = gql`
  mutation CancelMySubscription {
    cancelMySubscription
  }
`;
export const MY_INVOICES = gql`
  query MyInvoices {
    myInvoices {
      id
      createdAt
      amountCents
      currency
      status
      description
      cardBrand
      cardLast4
      viewUrl
      pdfUrl
    }
  }
`;
