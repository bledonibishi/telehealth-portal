import { gql } from '@apollo/client';

export const ORDER_FIELDS = gql`
  fragment OrderFields on Order {
    id
    reference
    sequence
    status
    createdAt
    pharmacyRef
    dispatchedAt
    carrier
    trackingNumber
    trackingUrl
    estimatedDeliveryFrom
    estimatedDeliveryTo
    readyForPickupAt
    trackingEvents {
      id
      status
      occurredAt
      location
      note
      source
    }
    outForDeliveryAt
    deliveredAt
    cancelledAt
    cancelReason
    cancelBillingNote
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
  query GetOrders($status: OrderStatus, $search: String) {
    orders(status: $status, search: $search) {
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
  mutation DispatchOrder($id: ID!, $pharmacyRef: String, $carrier: String, $trackingNumber: String, $trackingUrl: String, $estimatedDeliveryFrom: DateTime, $estimatedDeliveryTo: DateTime) {
    dispatchOrder(id: $id, pharmacyRef: $pharmacyRef, carrier: $carrier, trackingNumber: $trackingNumber, trackingUrl: $trackingUrl, estimatedDeliveryFrom: $estimatedDeliveryFrom, estimatedDeliveryTo: $estimatedDeliveryTo) {
      ...OrderFields
    }
  }
`;

export const UPDATE_ORDER_SHIPPING = gql`
  ${ORDER_FIELDS}
  mutation UpdateOrderShipping($id: ID!, $carrier: String, $trackingNumber: String, $trackingUrl: String, $estimatedDeliveryFrom: DateTime, $estimatedDeliveryTo: DateTime) {
    updateOrderShipping(id: $id, carrier: $carrier, trackingNumber: $trackingNumber, trackingUrl: $trackingUrl, estimatedDeliveryFrom: $estimatedDeliveryFrom, estimatedDeliveryTo: $estimatedDeliveryTo) {
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
  mutation CancelOrder($id: ID!, $reason: String!, $refund: Boolean, $endSubscription: Boolean) {
    cancelOrder(id: $id, reason: $reason, refund: $refund, endSubscription: $endSubscription) {
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
      refillRequestedAt
    }
  }
`;

export const MARK_ORDER_READY_FOR_PICKUP = gql`
  ${ORDER_FIELDS}
  mutation MarkOrderReadyForPickup($id: ID!) {
    markOrderReadyForPickup(id: $id) {
      ...OrderFields
    }
  }
`;

export const REPORT_ORDER_CANNOT_FULFIL = gql`
  ${ORDER_FIELDS}
  mutation ReportOrderCannotFulfil($id: ID!, $reason: String!) {
    reportOrderCannotFulfil(id: $id, reason: $reason) {
      ...OrderFields
    }
  }
`;

export const MARK_ORDER_HANDED_OVER = gql`
  ${ORDER_FIELDS}
  mutation MarkOrderHandedOver($id: ID!) {
    markOrderHandedOver(id: $id) {
      ...OrderFields
    }
  }
`;

export const PHARMACY_STATEMENT = gql`
  query PharmacyStatement($year: Int!, $month: Int!) {
    pharmacyStatement(year: $year, month: $month)
  }
`;
