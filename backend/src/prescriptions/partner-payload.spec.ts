import { buildPartnerPayload, partnerReference, signPartnerBody, type PartnerOrderSource } from './partner-payload';
import * as crypto from 'crypto';

const order = (over: Partial<any> = {}): PartnerOrderSource =>
  ({
    id: 'cmabc123456789xyz',
    sequence: 1,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    patient: {
      id: 'p-1', firstName: 'Emma', lastName: 'White', email: 'emma@example.com', phone: '+383 44 111 222',
      dateOfBirth: new Date('1978-04-14T00:00:00Z'),
      addressLine1: 'Rruga B 1', addressLine2: null, city: 'Prishtinë', postcode: '10000', country: 'Kosovo',
    },
    prescription: {
      id: 'rx-1', issuedAt: new Date('2026-10-01T09:00:00Z'), validUntil: new Date('2027-04-01T00:00:00Z'),
      refillsAllowed: 3, contentHash: 'abc', instructions: 'Weekly injection',
      prescriber: { firstName: 'David', lastName: 'Chen', licenseNumber: 'KS-1', licensingBody: 'Chamber' },
      items: [{
        quantity: 1, directions: 'Inject weekly',
        product: { name: 'Semaglutide', brandName: 'Wegovy', category: 'GLP1', form: 'INJECTION_PEN', requiresColdChain: true },
        strength: { label: '0.5 mg', packDescription: 'Pen, 4 doses' },
      }],
    },
    ...over,
  }) as any;

describe('buildPartnerPayload', () => {
  it('describes the supply, the prescription and where to deliver it', () => {
    const p = buildPartnerPayload(order(), 1);
    expect(p).toMatchObject({
      schemaVersion: 1,
      event: 'order.created',
      reference: partnerReference('cmabc123456789xyz'),
      isRepeat: false,
      patient: { firstName: 'Emma', dateOfBirth: '1978-04-14', phone: '+383 44 111 222' },
      delivery: { city: 'Prishtinë', country: 'Kosovo' },
      prescription: { id: 'rx-1', repeatsAllowed: 3, repeatsRemaining: 3, requiresColdChain: true },
      prescriber: { name: 'David Chen', licenseNumber: 'KS-1' },
    });
    expect(p.prescription.items[0]).toMatchObject({ brand: 'Wegovy', strength: '0.5 mg', pack: 'Pen, 4 doses', quantity: 1 });
  });

  it('counts repeats used from the live orders, and flags repeat supplies', () => {
    const p = buildPartnerPayload(order({ sequence: 3 }), 3);
    expect(p.isRepeat).toBe(true);
    expect(p.prescription.repeatsRemaining).toBe(1);
    expect(buildPartnerPayload(order({ sequence: 9 }), 9).prescription.repeatsRemaining).toBe(0);
  });

  it('leaves delivery null when the patient has no complete address', () => {
    const o = order();
    (o.patient as any).city = null;
    expect(buildPartnerPayload(o, 1).delivery).toBeNull();
  });

  it('shares only what dispensing needs: no email, no questionnaire, no notes', () => {
    const json = JSON.stringify(buildPartnerPayload(order(), 1));
    expect(json).not.toContain('emma@example.com');
    expect(json).not.toMatch(/quiz|questionnaire|overrideReason/i);
  });
});

describe('signPartnerBody', () => {
  it('is an HMAC-SHA256 of "<timestamp>.<body>" that the partner can recompute', () => {
    const sig = signPartnerBody('{"a":1}', 'secret', '1700000000');
    const expected = 'sha256=' + crypto.createHmac('sha256', 'secret').update('1700000000.{"a":1}').digest('hex');
    expect(sig).toBe(expected);
    expect(signPartnerBody('{"a":2}', 'secret', '1700000000')).not.toBe(sig);
  });
});
