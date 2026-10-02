import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { deliveryAddressOf, type DeliveryAddress } from './delivery-address';

/** Bumped whenever the shape below changes in a way the partner has to know about. */
export const PARTNER_PAYLOAD_VERSION = 1;

export const PARTNER_ORDER_INCLUDE = {
  patient: true,
  prescription: { include: { prescriber: true, items: { include: { product: true, strength: true } } } },
} satisfies Prisma.OrderInclude;

export type PartnerOrderSource = Prisma.OrderGetPayload<{ include: typeof PARTNER_ORDER_INCLUDE }>;

export interface PartnerOrderPayload {
  schemaVersion: number;
  event: 'order.created';
  /** Short reference to quote in calls and emails; the full id is `orderId`. */
  reference: string;
  orderId: string;
  /** 1 = first supply, 2 = first repeat, … */
  sequence: number;
  isRepeat: boolean;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string; dateOfBirth: string; phone: string | null };
  /** Null when the patient has no complete address yet — such an order is not sent. */
  delivery: DeliveryAddress | null;
  prescription: {
    id: string;
    issuedAt: string;
    validUntil: string | null;
    repeatsAllowed: number;
    repeatsRemaining: number;
    contentHash: string | null;
    instructions: string;
    requiresColdChain: boolean;
    items: Array<{
      product: string;
      brand: string | null;
      category: string;
      form: string;
      strength: string;
      pack: string | null;
      quantity: number;
      directions: string;
      requiresColdChain: boolean;
    }>;
  };
  prescriber: { name: string; licenseNumber: string | null; licensingBody: string | null } | null;
}

export const partnerReference = (orderId: string) => `TH-${orderId.slice(-8).toUpperCase()}`;

/**
 * Everything a pharmacy needs to dispense and ship one supply — and nothing more:
 * no questionnaire answers, no clinical notes, no email address.
 * `liveOrderCount` is how many non-cancelled orders the prescription has (this one included).
 */
export function buildPartnerPayload(order: PartnerOrderSource, liveOrderCount: number): PartnerOrderPayload {
  const rx = order.prescription;
  const repeatsUsed = Math.max(liveOrderCount - 1, 0);
  return {
    schemaVersion: PARTNER_PAYLOAD_VERSION,
    event: 'order.created',
    reference: partnerReference(order.id),
    orderId: order.id,
    sequence: order.sequence,
    isRepeat: order.sequence > 1,
    createdAt: order.createdAt.toISOString(),
    patient: {
      id: order.patient.id,
      firstName: order.patient.firstName,
      lastName: order.patient.lastName,
      dateOfBirth: order.patient.dateOfBirth.toISOString().slice(0, 10),
      phone: order.patient.phone,
    },
    delivery: deliveryAddressOf(order.patient),
    prescription: {
      id: rx.id,
      issuedAt: rx.issuedAt.toISOString(),
      validUntil: rx.validUntil?.toISOString() ?? null,
      repeatsAllowed: rx.refillsAllowed,
      repeatsRemaining: Math.max(rx.refillsAllowed - repeatsUsed, 0),
      contentHash: rx.contentHash,
      instructions: rx.instructions,
      requiresColdChain: rx.items.some((i) => i.product.requiresColdChain),
      items: rx.items.map((i) => ({
        product: i.product.name,
        brand: i.product.brandName,
        category: i.product.category,
        form: i.product.form,
        strength: i.strength.label,
        pack: i.strength.packDescription,
        quantity: i.quantity,
        directions: i.directions,
        requiresColdChain: i.product.requiresColdChain,
      })),
    },
    prescriber: rx.prescriber && {
      name: `${rx.prescriber.firstName} ${rx.prescriber.lastName}`,
      licenseNumber: rx.prescriber.licenseNumber,
      licensingBody: rx.prescriber.licensingBody,
    },
  };
}

/** `sha256=<hex>` over `<timestamp>.<body>` — the partner recomputes it with the shared secret. */
export function signPartnerBody(body: string, secret: string, timestamp: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** A short plain-text/HTML summary for the email channel. */
export function partnerEmailSummary(p: PartnerOrderPayload): { subject: string; html: string } {
  const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const d = p.delivery;
  const rows = p.prescription.items
    .map((i) => `<tr><td>${esc(i.brand ?? i.product)}</td><td>${esc(i.strength)}</td><td>${i.quantity}</td><td>${esc(i.directions)}</td></tr>`)
    .join('');
  const html = `
    <div style="font-family:sans-serif;max-width:620px">
      <h2 style="margin:0 0 4px">New order ${esc(p.reference)}${p.isRepeat ? ` · repeat ${p.sequence - 1}` : ''}</h2>
      <p style="color:#475569;margin:0 0 16px">Prescribed by ${esc(p.prescriber?.name ?? 'unknown')}${p.prescriber?.licenseNumber ? ` (${esc(p.prescriber.licenseNumber)})` : ''}${p.prescription.requiresColdChain ? ' · <strong>cold chain</strong>' : ''}</p>
      <table cellpadding="6" style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0">
        <tr style="background:#f1f5f9;text-align:left"><th>Medicine</th><th>Strength</th><th>Qty</th><th>Directions</th></tr>${rows}
      </table>
      <p><strong>Patient:</strong> ${esc(p.patient.firstName)} ${esc(p.patient.lastName)} · born ${esc(p.patient.dateOfBirth)}</p>
      <p><strong>Deliver to:</strong> ${d ? esc([d.name, d.addressLine1, d.addressLine2, d.postcode, d.city, d.country, d.phone].filter(Boolean).join(', ')) : 'no address on file'}</p>
      <p style="color:#94a3b8;font-size:12px">The full structured order is attached as JSON.</p>
    </div>`;
  return { subject: `New order ${p.reference}${p.prescription.requiresColdChain ? ' (cold chain)' : ''}`, html };
}
