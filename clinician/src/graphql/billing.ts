import { gql } from '@apollo/client';

export const BILLING_REFUND_REQUESTS = gql`
  query BillingRefundRequests {
    refundRequests {
      id
      requestedAt
      patientId
      patientName
      patientEmail
      latestOrderStatus
      latestOrderSequence
    }
  }
`;

export const BILLING_OVERVIEW = gql`
  query BillingOverview($patientId: ID!) {
    billingOverview(patientId: $patientId) {
      patientId
      patientName
      plan
      subscription {
        status
        endsAtPeriodEnd
        endsAt
      }
      invoicesAvailable
      refundPreview {
        amountCents
        feeKeptCents
        currency
      }
      invoices {
        id
        createdAt
        amountCents
        currency
        status
        description
        cardBrand
        cardLast4
        viewUrl
      }
      orders {
        id
        sequence
        status
        createdAt
        dispatchedAt
        paidAt
        paymentAmountCents
        paymentCurrency
      }
      refundHistory {
        id
        status
        requestedAt
        decidedAt
        outcome
      }
    }
  }
`;

export const AWAITING_PAYMENT = gql`
  query AwaitingPayment {
    awaitingPayment {
      orderId
      reference
      sequence
      patientId
      patientName
      patientEmail
      medication
      dosage
      createdAt
      paymentUrl
      paymentAmountCents
      paymentCurrency
      reminderSentAt
    }
  }
`;

export const PAYMENT_FAILURES = gql`
  query PaymentFailures {
    paymentFailures {
      patientId
      patientName
      patientEmail
      failedAt
    }
  }
`;

export const REFUND_DECISIONS = gql`
  query RefundDecisions {
    refundDecisions {
      id
      status
      requestedAt
      decidedAt
      outcome
      patientName
      patientEmail
      decidedByName
    }
  }
`;

export const RETRY_PATIENT_PAYMENT = gql`
  mutation RetryPatientPayment($patientId: ID!) {
    retryPatientPayment(patientId: $patientId)
  }
`;

export const REFUNDS_AWAITING_RETURN = gql`
  query RefundsAwaitingReturn {
    refundsAwaitingReturn {
      id
      requestedAt
      patientId
      patientName
      patientEmail
      awaitingOrderId
      orderStatus
      carrier
      trackingNumber
      trackingUrl
      latestTrackingStatus
    }
  }
`;

export const REFUND_WHEN_RETURNED = gql`
  mutation RefundWhenReturned($id: ID!, $endSubscription: Boolean) {
    refundWhenReturned(id: $id, endSubscription: $endSubscription) {
      id
      status
    }
  }
`;
