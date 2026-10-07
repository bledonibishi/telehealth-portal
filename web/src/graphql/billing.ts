import { gql } from '@apollo/client';

export const CREATE_BILLING_PORTAL_SESSION = gql`
  mutation CreateBillingPortalSession {
    createBillingPortalSession {
      url
    }
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
