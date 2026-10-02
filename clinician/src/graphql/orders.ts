import { gql } from '@apollo/client';

export const ORDER_FIELDS = gql`
  fragment OrderFields on Order {
    id
    sequence
    status
    createdAt
    pharmacyRef
    dispatchedAt
    carrier
    trackingNumber
    trackingUrl
    outForDeliveryAt
    deliveredAt
    cancelledAt
    cancelReason
    partnerTransmission {
      status
      event
      channels
      attempts
      lastError
      lastAttemptAt
      sentAt
    }
    shippingAddress {
      name
      phone
      addressLine1
      addressLine2
      city
      postcode
      country
    }
    patient {
      id
      firstName
      lastName
      email
      phone
      addressLine1
      addressLine2
      city
      postcode
      country
    }
    prescription {
      id
      status
      medication
      dosage
      instructions
      issuedAt
      validUntil
      refillsAllowed
      documentUrl
      consultation {
        id
        kind
      }
      items {
        id
        quantity
        product {
          id
          requiresColdChain
        }
      }
    }
  }
`;

export const GET_ORDERS = gql`
  ${ORDER_FIELDS}
  query GetOrders($status: OrderStatus) {
    orders(status: $status) {
      ...OrderFields
    }
  }
`;

export const PATIENT_ORDERS = gql`
  ${ORDER_FIELDS}
  query PatientOrders($patientId: ID!) {
    patientOrders(patientId: $patientId) {
      ...OrderFields
    }
  }
`;

export const DISPATCH_ORDER = gql`
  ${ORDER_FIELDS}
  mutation DispatchOrder($id: ID!, $pharmacyRef: String!) {
    dispatchOrder(id: $id, pharmacyRef: $pharmacyRef) {
      ...OrderFields
    }
  }
`;

export const MARK_ORDER_OUT_FOR_DELIVERY = gql`
  ${ORDER_FIELDS}
  mutation MarkOrderOutForDelivery($id: ID!, $carrier: String, $trackingNumber: String, $trackingUrl: String) {
    markOrderOutForDelivery(id: $id, carrier: $carrier, trackingNumber: $trackingNumber, trackingUrl: $trackingUrl) {
      ...OrderFields
    }
  }
`;

export const MARK_ORDER_DELIVERED = gql`
  ${ORDER_FIELDS}
  mutation MarkOrderDelivered($id: ID!) {
    markOrderDelivered(id: $id) {
      ...OrderFields
    }
  }
`;

export const CANCEL_ORDER = gql`
  ${ORDER_FIELDS}
  mutation CancelOrder($id: ID!, $reason: String!) {
    cancelOrder(id: $id, reason: $reason) {
      ...OrderFields
    }
  }
`;

export const CREATE_REPEAT_ORDER = gql`
  ${ORDER_FIELDS}
  mutation CreateRepeatOrder($prescriptionId: ID!) {
    createRepeatOrder(prescriptionId: $prescriptionId) {
      ...OrderFields
    }
  }
`;

export const PARTNER_INTEGRATION_STATUS = gql`
  query PartnerIntegrationStatus {
    partnerIntegrationStatus {
      webhookConfigured
      emailConfigured
      partnerName
      configurationProblem
    }
  }
`;

export const ORDER_PARTNER_PAYLOAD = gql`
  query OrderPartnerPayload($orderId: ID!) {
    orderPartnerPayload(orderId: $orderId)
  }
`;

export const SEND_ORDER_TO_PARTNER = gql`
  ${ORDER_FIELDS}
  mutation SendOrderToPartner($orderId: ID!) {
    sendOrderToPartner(orderId: $orderId) {
      ...OrderFields
    }
  }
`;

export const NEXT_SHIPMENT_ALERTS = gql`
  query NextShipmentAlerts {
    nextShipmentAlerts {
      prescriptionId
      patientId
      patientName
      medication
      lastShippedAt
      nextDueAt
      daysUntilDue
      urgency
      blocker
      repeatsLeft
    }
  }
`;
