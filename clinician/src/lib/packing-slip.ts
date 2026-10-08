import QRCode from 'qrcode';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

type SlipOrder = {
  reference: string;
  sequence: number;
  createdAt: string;
  patient: { firstName: string; lastName: string; phone?: string | null; addressLine1?: string | null; addressLine2?: string | null; city?: string | null; postcode?: string | null; country?: string | null };
  shippingAddress?: { name?: string | null; phone?: string | null; addressLine1?: string | null; addressLine2?: string | null; city?: string | null; postcode?: string | null; country?: string | null } | null;
  prescription: { medication: string; dosage: string; instructions: string; issuedAt: string; items?: Array<{ product?: { requiresColdChain?: boolean } }> };
};

/**
 * Opens a printable slip for one order: the parcel code (which the courier quotes back), who it's for, where it
 * goes, what is in it and any cold-chain warning. Built from what the pharmacy already sees; nothing is fetched.
 */
export function printPackingSlip(order: SlipOrder) {
  const to = order.shippingAddress?.addressLine1 ? order.shippingAddress : order.patient;
  const name = order.shippingAddress?.name || `${order.patient.firstName} ${order.patient.lastName}`;
  const phone = order.shippingAddress?.phone || order.patient.phone;
  const address = [to.addressLine1, to.addressLine2, [to.postcode, to.city].filter(Boolean).join(' '), to.country].filter(Boolean);
  const coldChain = order.prescription.items?.some((i) => i.product?.requiresColdChain);
  const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const build = (qr: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Packing slip ${esc(order.reference)}</title>
<style>
  body{font-family:system-ui,sans-serif;color:#111;margin:32px;max-width:640px}
  h1{font-size:15px;font-weight:600;margin:0 0 4px;color:#555}
  .ref{font-size:36px;font-weight:800;letter-spacing:.04em;margin:0 0 4px;font-family:ui-monospace,monospace}
  .hint{font-size:13px;color:#555;margin:0 0 24px}
  .box{border:1px solid #bbb;border-radius:8px;padding:14px 16px;margin:0 0 14px}
  .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#777;margin:0 0 6px}
  p{margin:2px 0;font-size:14px;line-height:1.5}
  .cold{border:2px solid #0369a1;background:#e0f2fe;color:#075985;font-weight:700;font-size:15px}
  .small{font-size:12px;color:#555;white-space:pre-line}
  @media print{body{margin:12mm}}
.codeRow{display:flex;align-items:center;justify-content:space-between;gap:16px}.codeRow .ref{margin:0}
</style></head><body>
<h1>Packing slip · ${order.sequence === 1 ? 'first supply' : `repeat ${order.sequence - 1}`}</h1>
<div class="codeRow"><p class="ref">${esc(order.reference)}</p>${qr ? `<img class="qr" src="${qr}" alt="" width="96" height="96">` : ''}</div>
<p class="hint">Write or stick this code on the parcel. The courier quotes it when they collect and deliver.</p>
${coldChain ? '<div class="box cold">COLD CHAIN — keep refrigerated (2–8 °C). Hand over for same-day or next-day delivery only.</div>' : ''}
<div class="box"><p class="label">Deliver to</p><p><b>${esc(name)}</b></p>${address.length ? address.map((l) => `<p>${esc(l)}</p>`).join('') : '<p>Delivery is arranged by the clinic. The courier will quote the parcel code when collecting.</p>'}${phone ? `<p>Phone: ${esc(phone)}</p>` : ''}</div>
<div class="box"><p class="label">Contents</p><p><b>${esc(order.prescription.medication)}</b></p><p>${esc(order.prescription.dosage)}</p><p class="small">${esc(order.prescription.instructions)}</p></div>
<p class="small">Prescribed ${esc(date(order.prescription.issuedAt))} · ordered ${esc(date(order.createdAt))}</p>
<script>window.onload=function(){window.print()}</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return false; // pop-ups blocked
  // The window is opened straight away (a blocker only allows that inside the click); the slip is written once the code is drawn.
  const write = (qr: string) => {
    w.document.open();
    w.document.write(build(qr));
    w.document.close();
  };
  QRCode.toDataURL(order.reference, { margin: 1, width: 192 }).then(write, () => write(''));
  return true;
}
