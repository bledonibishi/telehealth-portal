export interface DeliveryAddress {
  name: string;
  phone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  country: string;
}

export function deliveryAddressOf(patient: {
  firstName: string; lastName: string; phone: string | null;
  addressLine1: string | null; addressLine2: string | null; city: string | null; postcode: string | null; country: string | null;
}): DeliveryAddress | null {
  if (!patient.addressLine1 || !patient.city || !patient.postcode || !patient.country) return null;
  return {
    name: `${patient.firstName} ${patient.lastName}`,
    phone: patient.phone,
    addressLine1: patient.addressLine1,
    addressLine2: patient.addressLine2,
    city: patient.city,
    postcode: patient.postcode,
    country: patient.country,
  };
}

/**
 * The address stored on an order, in the shape the API promises. Older orders (and seeded ones) kept it as
 * { line1, city, postcode, country } without the patient's name, which the API treats as required.
 */
export function storedAddressOf(
  stored: unknown,
  patient?: { firstName?: string | null; lastName?: string | null } | null,
): (Partial<DeliveryAddress> & { name: string }) | null {
  if (!stored || typeof stored !== 'object') return null;
  const s = stored as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  const patientName = [patient?.firstName, patient?.lastName].filter(Boolean).join(' ');
  return {
    name: text(s.name) ?? patientName,
    phone: text(s.phone) ?? null,
    addressLine1: text(s.addressLine1) ?? text(s.line1),
    addressLine2: text(s.addressLine2) ?? text(s.line2) ?? null,
    city: text(s.city),
    postcode: text(s.postcode) ?? text(s.postalCode),
    country: text(s.country),
  };
}
