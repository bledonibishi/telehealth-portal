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
