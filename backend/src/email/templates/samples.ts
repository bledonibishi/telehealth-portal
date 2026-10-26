import * as t from './index';

const P = 'http://localhost:3000';
const C = 'http://localhost:3002';
const track = 'https://www.dhl.com/xk-en/home/tracking.html?tracking-id=JD0146000123';

/** One of every email with believable data, for `npm run email-preview` and for the test that every template renders. */
export const SAMPLES: Array<{ name: string; content: t.EmailContent }> = [
  { name: 'verification-code', content: t.verificationCodeEmail({ code: '280242' }) },
  { name: 'activation', content: t.activationEmail({ firstName: 'Redon', activationUrl: `${P}/activate?token=sample` }) },
  { name: 'payment-receipt', content: t.paymentReceiptEmail({ firstName: 'Redon', amount: 12900, currency: 'eur', paidAt: new Date(), reference: 'A1B2C3D4-0001' }) },
  { name: 'refund-awaiting-return', content: t.refundAwaitingReturnEmail({ firstName: 'Redon' }) },
  { name: 'payment-failed', content: t.paymentFailedEmail({ firstName: 'Redon', settingsUrl: `${P}/settings` }) },
  { name: 'refund', content: t.refundEmail({ firstName: 'Redon', amount: 12900, currency: 'eur' }) },
  { name: 'consultation-update', content: t.consultationUpdateEmail({ firstName: 'Redon', headline: 'Your treatment has been approved', portalUrl: `${P}/dashboard` }) },
  { name: 'staff-alert', content: t.staffAlertEmail({ firstName: 'Arta', headline: 'Urgent appointment request', portalUrl: `${C}/appointments` }) },
  { name: 'order-shipped', content: t.orderUpdateEmail({ firstName: 'Redon', kind: 'SHIPPED', carrier: 'DHL', trackingNumber: 'JD0146000123', trackingUrl: track, expected: 'Mon 12 Oct', ordersUrl: `${P}/orders` }) },
  { name: 'order-out-for-delivery', content: t.orderUpdateEmail({ firstName: 'Redon', kind: 'OUT_FOR_DELIVERY', carrier: 'DHL', trackingNumber: 'JD0146000123', trackingUrl: track, ordersUrl: `${P}/orders` }) },
  { name: 'order-delivery-failed', content: t.orderUpdateEmail({ firstName: 'Redon', kind: 'DELIVERY_FAILED', carrier: 'DHL', ordersUrl: `${P}/orders` }) },
  { name: 'order-delivered', content: t.orderUpdateEmail({ firstName: 'Redon', kind: 'DELIVERED', ordersUrl: `${P}/orders` }) },
  { name: 'shop-order-paid', content: t.shopOrderEmail({ firstName: 'Redon', kind: 'PAID', reference: 'OMO-7K3P9Q', items: [{ name: 'Whey protein 1 kg', quantity: 2, totalCents: 5980 }], shippingCents: 300, totalCents: 6280, currency: 'eur', orderUrl: 'http://localhost:3001/shop/order/OMO-7K3P9Q' }) },
  { name: 'shop-order-dispatched', content: t.shopOrderEmail({ firstName: 'Redon', kind: 'DISPATCHED', reference: 'OMO-7K3P9Q', items: [{ name: 'Whey protein 1 kg', quantity: 2, totalCents: 5980 }], shippingCents: 300, totalCents: 6280, currency: 'eur', orderUrl: 'http://localhost:3001/shop/order/OMO-7K3P9Q', carrier: 'DHL', trackingNumber: 'JD0146000123' }) },
  { name: 'shop-order-confirmed-cod', content: t.shopOrderEmail({ firstName: 'Redon', kind: 'CONFIRMED_COD', reference: 'OMO-7K3P9Q', items: [{ name: 'Whey protein 1 kg', quantity: 1, totalCents: 2990 }], shippingCents: 300, totalCents: 3290, currency: 'eur', orderUrl: 'http://localhost:3001/shop/order/OMO-7K3P9Q' }) },
  { name: 'shop-order-transfer', content: t.shopOrderEmail({ firstName: 'Redon', kind: 'TRANSFER_DETAILS', reference: 'OMO-7K3P9Q', items: [{ name: 'Whey protein 1 kg', quantity: 1, totalCents: 2990 }], shippingCents: 300, totalCents: 3290, currency: 'eur', orderUrl: 'http://localhost:3001/shop/order/OMO-7K3P9Q', transfer: { iban: 'XK051212012345678906', accountName: 'Omo Pharmacy SH.P.K.', bankName: 'Raiffeisen Bank Kosovo', payBy: new Date('2026-11-02') } }) },
  { name: 'shop-order-refunded', content: t.shopOrderEmail({ firstName: 'Redon', kind: 'REFUNDED', reference: 'OMO-7K3P9Q', items: [], shippingCents: 300, totalCents: 6280, currency: 'eur', orderUrl: 'http://localhost:3001/shop/order/OMO-7K3P9Q', refundedCents: 2990 }) },
  { name: 'dose-reminder', content: t.doseReminderEmail({ firstName: 'Redon', productName: 'Semaglutide', scheduledFor: new Date(Date.now() + 3 * 864e5), portalUrl: `${P}/doses` }) },
  { name: 'supply-payment', content: t.supplyPaymentEmail({ firstName: 'Redon', amount: 12900, currency: 'eur', payUrl: 'https://invoice.stripe.com/i/sample' }) },
  { name: 'supply-payment-reminder', content: t.supplyPaymentEmail({ firstName: 'Redon', amount: 12900, currency: 'eur', payUrl: 'https://invoice.stripe.com/i/sample', reminder: true }) },
  { name: 'come-back', content: t.comeBackEmail({ firstName: 'Redon', amount: 9500, currency: 'eur', payUrl: 'https://invoice.stripe.com/i/sample', until: '3 Nov 2026' }) },
  { name: 'lapsed', content: t.lapsedEmail({ firstName: 'Redon', month: 2, of: 6, portalUrl: P, closesOn: '12 Jun 2027' }) },
  { name: 'lapsed-last', content: t.lapsedEmail({ firstName: 'Redon', month: 6, of: 6, portalUrl: P, closesOn: '12 Jun 2027' }) },
  { name: 'lapsed-closed', content: t.lapsedClosedEmail({ firstName: 'Redon' }) },
  { name: 'welcome-back', content: t.welcomeBackEmail({ firstName: 'Redon', signInUrl: `${P}/login`, resetUrl: `${P}/forgot-password`, idCheckNeeded: true }) },
  { name: 'account-closed', content: t.accountClosedEmail({ firstName: 'Redon' }) },
  { name: 'check-in', content: t.checkInEmail({ firstName: 'Redon', checkInUrl: `${P}/checkin/sample` }) },
  { name: 'lead-reminder', content: t.leadReminderEmail({ firstName: 'Redon', continueUrl: `${P}/glp1-eligibility`, unsubscribeUrl: 'http://localhost:4000/leads/unsubscribe?lead=sample&sig=sample', last: false }) },
  { name: 'referral-reward', content: t.referralRewardEmail({ firstName: 'Redon', amountLabel: '€20', autoApplied: true, rewardsUrl: `${P}/rewards` }) },
  { name: 'clinician-invite', content: t.clinicianInviteEmail({ firstName: 'Dr Hoxha', inviteUrl: `${C}/set-password?token=sample`, firstTime: true }) },
  { name: 'password-reset', content: t.passwordResetEmail({ firstName: 'Redon', resetUrl: `${P}/reset-password?token=sample`, expiresInMinutes: 60 }) },
  { name: 'password-changed', content: t.passwordChangedEmail({ firstName: 'Redon' }) },
  { name: 'partner-order', content: t.partnerOrderEmail({ subject: 'New order OMO-1042', html: '<h2 style="margin:0 0 4px">New order OMO-1042 is waiting for you</h2><p>Patient and prescription details are in the portal only.</p>' }) },
];
