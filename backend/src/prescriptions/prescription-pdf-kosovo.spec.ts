import { renderKosovoPrescriptionPdf } from './prescription-pdf-kosovo';
import { PrescriptionPdfInput } from './prescription-pdf';

const item = (n: number, over: object = {}) => ({
  quantity: 1,
  directions: `Apply one patch twice a week, medicine number ${n}.`,
  strength: { label: '100 micrograms/24 h', packDescription: '8 patches' },
  product: { name: `Estradiol patch ${n}`, brandName: `Evorel ${n}`, form: 'PATCH', requiresColdChain: false },
  ...over,
});

const rx = (over: Partial<PrescriptionPdfInput> = {}): PrescriptionPdfInput => ({
  id: 'cmuyaci6g0002znigm9hv8bi7',
  issuedAt: new Date('2026-10-07T16:40:00Z'),
  validUntil: new Date('2026-11-06T16:40:00Z'),
  refillsAllowed: 0,
  status: 'ACTIVE',
  contentHash: 'a3f1c9d84e2b7f60c15d9e8a4b3c2d1e0f9a8b7c6d5e4f30211203948576a1b2',
  tampered: false,
  medication: 'Evorel',
  dosage: '100 micrograms/24 h × 1',
  instructions: 'Apply one patch twice a week.',
  patient: { firstName: 'Test', lastName: 'Patient', dateOfBirth: new Date('1990-01-01'), gender: 'FEMALE', allergies: 'None known', addressLine1: 'Rr. Test 1', city: 'Vushtrri', country: 'Kosovë' },
  prescriber: { firstName: 'Test', lastName: 'Doctor', licenseNumber: 'KS-MED-1', licensingBody: 'Kosovo Chamber of Physicians' },
  items: [item(1), item(2)],
  ...over,
});

const clinic = { name: 'Primavera Health', address: 'Prishtinë' };
const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page[^s]/g) ?? []).length;

describe('renderKosovoPrescriptionPdf', () => {
  it('draws a normal prescription as one PDF page', async () => {
    const pdf = await renderKosovoPrescriptionPdf(rx(), clinic);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(pdf)).toBe(1);
  });

  it.each([
    ['a cancelled one', { status: 'CANCELLED', cancelReason: 'Replaced' }],
    ['one that was altered', { tampered: true }],
    ['one with no prescriber', { prescriber: null }],
    ['one with no items (issued before structured prescribing)', { items: [] }],
    ['a patient with nothing but a name', { patient: { firstName: 'A', lastName: 'B', dateOfBirth: new Date('1980-05-05') } }],
  ])('still produces a PDF for %s', async (_, over) => {
    const pdf = await renderKosovoPrescriptionPdf(rx(over as Partial<PrescriptionPdfInput>), clinic);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('moves a long medicine list to a new page', async () => {
    const pdf = await renderKosovoPrescriptionPdf(rx({ items: Array.from({ length: 9 }, (_, i) => item(i + 1)) }), clinic);
    expect(pages(pdf)).toBeGreaterThan(1);
  });
});
