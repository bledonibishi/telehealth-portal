import * as t from './index';

const P = 'http://localhost:3000';
const C = 'http://localhost:3002';
const track = 'https://www.dhl.com/xk-en/home/tracking.html?tracking-id=JD0146000123';

/** One of every email with believable data, for `npm run email-preview` and for the test that every template renders. */
export const SAMPLES: Array<{ name: string; content: t.EmailContent }> = [
  { name: 'verification-code', content: t.verificationCodeEmail({ code: '280242' }) },
  { name: 'activation', content: t.activationEmail({ firstName: 'Redon', activationUrl: `${P}/activate?token=sample` }) },
  { name: 'payment-receipt', content: t.paymentReceiptEmail({ firstName: 'Redon', amount: 12900, currency: 'eur', paidAt: new Date(), reference: 'A1B2C3D4-0001' }) },
  { name: 'refund', content: t.refundEmail({ firstName: 'Redon', amount: 12900, currency: 'eur' }) },
  { name: 'consultation-update', content: t.consultationUpdateEmail({ firstName: 'Redon', headline: 'Your treatment has been approved', portalUrl: `${P}/dashboard` }) },
  { name: 'order-shipped', content: t.orderUpdateEmail({ firstName: 'Redon', kind: 'SHIPPED', carrier: 'DHL', trackingNumber: 'JD0146000123', trackingUrl: track, expected: 'Mon 12 Oct', ordersUrl: `${P}/orders` }) },
  { name: 'order-out-for-delivery', content: t.orderUpdateEmail({ firstName: 'Redon', kind: 'OUT_FOR_DELIVERY', carrier: 'DHL', trackingNumber: 'JD0146000123', trackingUrl: track, ordersUrl: `${P}/orders` }) },
  { name: 'order-delivery-failed', content: t.orderUpdateEmail({ firstName: 'Redon', kind: 'DELIVERY_FAILED', carrier: 'DHL', ordersUrl: `${P}/orders` }) },
  { name: 'order-delivered', content: t.orderUpdateEmail({ firstName: 'Redon', kind: 'DELIVERED', ordersUrl: `${P}/orders` }) },
  { name: 'dose-reminder', content: t.doseReminderEmail({ firstName: 'Redon', productName: 'Semaglutide', scheduledFor: new Date(Date.now() + 3 * 864e5), portalUrl: `${P}/doses` }) },
  { name: 'check-in', content: t.checkInEmail({ firstName: 'Redon', checkInUrl: `${P}/checkin/sample` }) },
  { name: 'referral-reward', content: t.referralRewardEmail({ firstName: 'Redon', amountLabel: '€20', autoApplied: true, rewardsUrl: `${P}/rewards` }) },
  { name: 'clinician-invite', content: t.clinicianInviteEmail({ firstName: 'Dr Hoxha', inviteUrl: `${C}/set-password?token=sample`, firstTime: true }) },
  { name: 'password-reset', content: t.passwordResetEmail({ firstName: 'Redon', resetUrl: `${P}/reset-password?token=sample`, expiresInMinutes: 60 }) },
  { name: 'password-changed', content: t.passwordChangedEmail({ firstName: 'Redon' }) },
  { name: 'partner-order', content: t.partnerOrderEmail({ subject: 'New order OMO-1042', html: '<h2 style="margin:0 0 4px">New order OMO-1042 is waiting for you</h2><p>Patient and prescription details are in the portal only.</p>' }) },
];
