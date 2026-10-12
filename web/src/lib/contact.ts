// The clinic's contact details, set per deployment (NEXT_PUBLIC_SUPPORT_PHONE etc.). A row is only shown
// when it is set, so the portal never shows a made-up number.
export const CONTACT = {
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE || null,
  phoneHours: process.env.NEXT_PUBLIC_SUPPORT_HOURS || null,
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || null,
  urgentPhone: process.env.NEXT_PUBLIC_URGENT_PHONE || null,
};

/** The public emergency number. Life-threatening symptoms go here, not to the clinic. */
export const EMERGENCY_NUMBER = process.env.NEXT_PUBLIC_EMERGENCY_NUMBER || '112';

export const telHref = (n: string) => `tel:${n.replace(/[^+0-9]/g, '')}`;
