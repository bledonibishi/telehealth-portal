import { gql } from '@apollo/client';

const ORDER_FIELDS = gql`
  fragment ShopOrderFields on ShopOrder {
    id
    reference
    status
    provider
    email
    firstName
    lastName
    phone
    address
    subtotalCents
    shippingCents
    totalCents
    refundedCents
    currency
    createdAt
    paidAt
    dispatchedAt
    deliveredAt
    cancelledAt
    cancelReason
    carrier
    trackingNumber
    paidTwice
    items {
      name
      unitPriceCents
      quantity
    }
    payments {
      id
      provider
      attempt
      status
      amountCents
      providerOrderId
      cardSummary
      failureMessage
      completedAt
    }
    refunds {
      id
      paymentId
      amountCents
      reason
      createdAt
    }
    fiscalReceipts {
      id
      kind
      amountCents
      status
      receiptNumber
    }
  }
`;

export const SHOP_ORDERS = gql`
  query ShopOrders($status: String, $search: String) {
    shopOrders(status: $status, search: $search) {
      ...ShopOrderFields
    }
  }
  ${ORDER_FIELDS}
`;

export const SHOP_PRODUCTS = gql`
  query ShopProducts {
    shopProducts {
      id
      slug
      name
      brand
      description
      imageUrl
      category
      priceCents
      currency
      vatRate
      stock
      maxPerOrder
      active
      sortOrder
      updatedAt
    }
  }
`;

export const PENDING_FISCAL_RECEIPTS = gql`
  query PendingFiscalReceipts {
    pendingFiscalReceipts {
      id
      kind
      amountCents
      currency
      createdAt
      orderReference
      buyerName
    }
  }
`;

export const SAVE_SHOP_PRODUCT = gql`
  mutation SaveShopProduct($input: ShopProductInput!) {
    saveShopProduct(input: $input) {
      id
    }
  }
`;

export const MARK_SHOP_ORDER_DISPATCHED = gql`
  mutation MarkShopOrderDispatched($orderId: ID!, $carrier: String, $trackingNumber: String) {
    markShopOrderDispatched(orderId: $orderId, carrier: $carrier, trackingNumber: $trackingNumber) {
      ...ShopOrderFields
    }
  }
  ${ORDER_FIELDS}
`;

export const MARK_SHOP_ORDER_DELIVERED = gql`
  mutation MarkShopOrderDelivered($orderId: ID!) {
    markShopOrderDelivered(orderId: $orderId) {
      ...ShopOrderFields
    }
  }
  ${ORDER_FIELDS}
`;

export const CANCEL_SHOP_ORDER = gql`
  mutation CancelShopOrder($orderId: ID!, $reason: String!) {
    cancelShopOrder(orderId: $orderId, reason: $reason) {
      ...ShopOrderFields
    }
  }
  ${ORDER_FIELDS}
`;

export const REFUND_SHOP_ORDER = gql`
  mutation RefundShopOrder($input: ShopRefundInput!) {
    refundShopOrder(input: $input) {
      ...ShopOrderFields
    }
  }
  ${ORDER_FIELDS}
`;

export const MARK_SHOP_PAYMENT_RECEIVED = gql`
  mutation MarkShopPaymentReceived($orderId: ID!) {
    markShopPaymentReceived(orderId: $orderId) {
      ...ShopOrderFields
    }
  }
  ${ORDER_FIELDS}
`;

export const MARK_FISCAL_RECEIPT_ISSUED = gql`
  mutation MarkFiscalReceiptIssued($id: ID!, $receiptNumber: String!) {
    markFiscalReceiptIssued(id: $id, receiptNumber: $receiptNumber) {
      id
      status
    }
  }
`;
