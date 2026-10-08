import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { GenericCourierAdapter } from './generic.adapter';

const adapter = new GenericCourierAdapter();
const sign = (body: string, secret: string) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('GenericCourierAdapter.verify', () => {
  const body = JSON.stringify({ status: 'delivered', reference: 'o-1' });
  const raw = Buffer.from(body);

  it('accepts a call signed with the shared secret', () => {
    expect(adapter.verify({ rawBody: raw, headers: { 'x-courier-signature': sign(body, 's3cret') }, secret: 's3cret' })).toBe(true);
  });

  it('accepts the signature without the sha256= prefix', () => {
    const hex = sign(body, 's3cret').replace('sha256=', '');
    expect(adapter.verify({ rawBody: raw, headers: { 'x-courier-signature': hex }, secret: 's3cret' })).toBe(true);
  });

  it('refuses a wrong secret, a changed body, a missing or malformed signature, and an empty secret', () => {
    expect(adapter.verify({ rawBody: raw, headers: { 'x-courier-signature': sign(body, 'other') }, secret: 's3cret' })).toBe(false);
    expect(adapter.verify({ rawBody: Buffer.from(body + ' '), headers: { 'x-courier-signature': sign(body, 's3cret') }, secret: 's3cret' })).toBe(false);
    expect(adapter.verify({ rawBody: raw, headers: {}, secret: 's3cret' })).toBe(false);
    expect(adapter.verify({ rawBody: raw, headers: { 'x-courier-signature': 'sha256=zzzz' }, secret: 's3cret' })).toBe(false);
    expect(adapter.verify({ rawBody: raw, headers: { 'x-courier-signature': sign(body, '') }, secret: '' })).toBe(false);
  });
});

describe('GenericCourierAdapter.parse: events without an id', () => {
  const adapter = new GenericCourierAdapter();
  const body = { reference: 'o-1', status: 'Delivery failed', occurredAt: '2026-10-13T08:00:00Z' };

  it('gives a resend of the same event the same id, so it is recorded once', () => {
    expect(adapter.parse(body)[0].externalId).toBe(adapter.parse({ ...body })[0].externalId);
    expect(adapter.parse(body)[0].externalId).toMatch(/^body:[0-9a-f]{32}$/);
  });

  it('gives a different event a different id', () => {
    expect(adapter.parse(body)[0].externalId).not.toBe(adapter.parse({ ...body, status: 'Delivered' })[0].externalId);
  });

  it('prefers the sender’s own event id', () => {
    expect(adapter.parse({ ...body, eventId: 'abc' })[0].externalId).toBe('abc');
  });
});

describe('GenericCourierAdapter.parse', () => {
  it('reads one event, or a list', () => {
    const one = adapter.parse({ reference: 'o-1', status: 'Out for delivery', eventId: 'e1', occurredAt: '2026-10-13T08:00:00Z', location: 'Prishtinë' });
    expect(one).toEqual([expect.objectContaining({ reference: 'o-1', status: 'OUT_FOR_DELIVERY', externalId: 'e1', location: 'Prishtinë', occurredAt: new Date('2026-10-13T08:00:00Z') })]);
    expect(adapter.parse({ events: [{ trackingNumber: 'T1', status: 'picked_up' }, { trackingNumber: 'T1', status: 'delivered' }] })).toHaveLength(2);
  });

  it('reads the carrier, link and expected window', () => {
    const [e] = adapter.parse({
      trackingNumber: 'T1', status: 'in_transit', carrier: 'Posta BEKI', trackingUrl: 'https://beki.example/T1',
      estimatedDeliveryFrom: '2026-10-13', estimatedDeliveryTo: '2026-10-14',
    });
    expect(e).toMatchObject({ carrier: 'Posta BEKI', trackingUrl: 'https://beki.example/T1' });
    expect(e.estimatedDeliveryTo).toEqual(new Date('2026-10-14'));
  });

  it('defaults the time to now when none is sent', () => {
    const before = Date.now();
    const [e] = adapter.parse({ reference: 'o-1', status: 'delivered' });
    expect(e.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it.each([
    ['no status the app knows', { reference: 'o-1', status: 'teleported' }, /unknown status/],
    ['a status only the pharmacy can report', { reference: 'o-1', status: 'cannot_fulfil' }, /unknown status/],
    ['neither a reference nor a tracking number', { status: 'delivered' }, /reference/],
    ['a tracking link that isn’t a web link', { reference: 'o-1', status: 'delivered', trackingUrl: 'javascript:alert(1)' }, /trackingUrl/],
    ['an invalid date', { reference: 'o-1', status: 'delivered', occurredAt: 'yesterday-ish' }, /occurredAt/],
    ['an empty list', { events: [] }, /Expected an event/],
    ['a body that is not an object', 'hello', /unknown status|Expected an event/],
  ])('rejects %s', (_, body, message) => {
    expect(() => adapter.parse(body)).toThrow(BadRequestException);
    expect(() => adapter.parse(body)).toThrow(message);
  });

  it('refuses more than 100 events in one call', () => {
    expect(() => adapter.parse({ events: Array.from({ length: 101 }, () => ({ reference: 'o', status: 'delivered' })) })).toThrow(/At most 100/);
  });
});
