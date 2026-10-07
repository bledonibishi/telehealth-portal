/** Lower case, accents and punctuation gone, so "Prishtine" finds "Prishtinë" and "th qen6" finds "TH-QEN6JGA5". */
const normalise = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s\-_.]/g, '');

type SearchableOrder = {
  id: string;
  reference?: string | null;
  trackingNumber?: string | null;
  pharmacyRef?: string | null;
  carrier?: string | null;
  patient: { firstName: string; lastName: string; email?: string | null; phone?: string | null };
  prescription?: { medication?: string | null } | null;
};

/**
 * Whether an order matches what was typed. Every word typed has to match somewhere in the order: the patient's
 * name, email or phone, the parcel code (with or without "TH-"), the tracking number, the pharmacy's reference,
 * the courier or the medicine. "emma white" and "white emma" both find Emma White.
 */
export function orderMatchesSearch(order: SearchableOrder, query: string): boolean {
  const words = query.split(/\s+/).map(normalise).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [
    `${order.patient.firstName} ${order.patient.lastName}`,
    order.patient.email,
    order.patient.phone,
    order.reference,
    order.id,
    order.trackingNumber,
    order.pharmacyRef,
    order.carrier,
    order.prescription?.medication,
  ]
    .map(normalise)
    .join('|');
  return words.every((w) => haystack.includes(w));
}
