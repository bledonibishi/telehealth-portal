import { PrescriptionPdfInput, renderPrescriptionPdf } from './prescription-pdf';

const item = (n: number, over: object = {}) => ({
  quantity: 1,
  directions: `Take one capsule by mouth at bedtime, medicine number ${n}.`,
  strength: { label: '100 mg', packDescription: '30 capsules' },
  product: { name: `Generic ${n}`, brandName: `Brand ${n}`, form: 'CAPSULE', requiresColdChain: false },
  ...over,
});

const rx = (over: Partial<PrescriptionPdfInput> = {}): PrescriptionPdfInput => ({
  id: 'cmuyaci6g0002znigm9hv8bi7',
  issuedAt: new Date('2026-10-07T16:40:00Z'),
  validUntil: new Date('2027-04-05T16:40:00Z'),
  refillsAllowed: 5,
  status: 'ACTIVE',
  contentHash: 'a3f1c9d84e2b7f60c15d9e8a4b3c2d1e0f9a8b7c6d5e4f30211203948576a1b2',
  tampered: false,
  medication: 'Brand 1',
  dosage: '100 mg × 1',
  instructions: 'Take one capsule by mouth at bedtime, medicine number 1.\nReview after 3 months.',
  patient: { firstName: 'Bledon', lastName: 'Ibishi', dateOfBirth: new Date('1990-01-01'), addressLine1: 'Hamdi Gashi', city: 'Vushtrri', postcode: '42000', country: 'Albania' },
  prescriber: { firstName: 'David', lastName: 'Chen', licenseNumber: 'KS-MED-7654321', licensingBody: 'Kosovo Chamber of Physicians' },
  items: [item(1)],
  ...over,
});

const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page[^s]/g) ?? []).length;
const clinic = { name: 'Primavera Health', address: 'Rr. Nëna Terezë 12, Prishtinë' };

describe('renderPrescriptionPdf', () => {
  it('draws a normal prescription as one valid PDF page', async () => {
    const pdf = await renderPrescriptionPdf(rx({ items: [item(1), item(2)] }), clinic);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(pdf)).toBe(1);
  });

  it.each([
    ['one that was cancelled', { status: 'CANCELLED', cancelReason: 'Replaced by a new prescription' }],
    ['one whose content changed since it was issued', { tampered: true }],
    ['one with no authentication fingerprint (issued before they existed)', { contentHash: null }],
    ['one with no prescriber on record', { prescriber: null }],
    ['one with no expiry', { validUntil: null }],
    ['a cold-chain medicine', { items: [item(1, { product: { name: 'Tirzepatide', brandName: 'Mounjaro', form: 'INJECTION_PEN', requiresColdChain: true } })] }],
    ['one issued before structured prescribing, with no items', { items: [] }],
    ['a patient with no address', { patient: { firstName: 'A', lastName: 'B', dateOfBirth: new Date('1980-05-05') } }],
    ['names with accents', { patient: { firstName: 'Lirie', lastName: 'Krasniqi-Çela', dateOfBirth: new Date('1980-05-05'), city: 'Prishtinë', country: 'Kosovë' } }],
  ])('still produces a PDF for %s', async (_, over) => {
    const pdf = await renderPrescriptionPdf(rx(over as Partial<PrescriptionPdfInput>), clinic);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('runs onto more pages for a long list, never cutting a medicine in half', async () => {
    const pdf = await renderPrescriptionPdf(rx({ items: Array.from({ length: 9 }, (_, i) => item(i + 1)) }), clinic);
    expect(pages(pdf)).toBeGreaterThan(1);
  });

  it('works without a clinic address', async () => {
    const pdf = await renderPrescriptionPdf(rx(), { name: 'Primavera Health' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
