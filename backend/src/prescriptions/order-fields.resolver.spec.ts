import { OrderFieldsResolver } from './order-fields.resolver';

describe('OrderFieldsResolver.reference', () => {
  it('is the parcel code worked out from the order id', () => {
    expect(new OrderFieldsResolver().reference({ id: 'cmuycf9et001964b2qen6jga5' })).toBe('TH-QEN6JGA5');
  });

  it('is stable, and different for different orders', () => {
    const r = new OrderFieldsResolver();
    expect(r.reference({ id: 'cmaaaaaaaaaaaaaaaaaaaaaa1' })).toBe(r.reference({ id: 'cmaaaaaaaaaaaaaaaaaaaaaa1' }));
    expect(r.reference({ id: 'cmaaaaaaaaaaaaaaaaaaaaaa1' })).not.toBe(r.reference({ id: 'cmaaaaaaaaaaaaaaaaaaaaaa2' }));
  });
});
