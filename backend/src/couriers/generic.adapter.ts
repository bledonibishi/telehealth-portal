import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { CourierAdapter, TrackingEventInput } from './courier-adapter';
import { TRACKING_STATUSES, parseTrackingStatus } from './tracking-status';

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

function date(v: unknown, field: string): Date | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`"${field}" isn’t a valid date`);
  return d;
}

/**
 * The format we ask a courier (or whoever builds their integration) to send. It is the same for everyone, so a
 * new courier needs no code from us: see docs/courier-webhook.md. Signed with HMAC-SHA256 over the raw body,
 * sent as `X-Courier-Signature: sha256=<hex>`.
 */
export class GenericCourierAdapter implements CourierAdapter {
  readonly key = 'generic';

  verify({ rawBody, headers, secret }: Parameters<CourierAdapter['verify']>[0]) {
    const header = headers['x-courier-signature'];
    const given = (Array.isArray(header) ? header[0] : header)?.trim().replace(/^sha256=/i, '');
    if (!given || !secret) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(given, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parse(body: unknown): TrackingEventInput[] {
    const list = Array.isArray((body as any)?.events) ? (body as any).events : body && typeof body === 'object' ? [body] : [];
    if (list.length === 0) throw new BadRequestException('Expected an event, or { "events": [ … ] }');
    if (list.length > 100) throw new BadRequestException('At most 100 events per call');

    return list.map((raw: any, i: number): TrackingEventInput => {
      const at = `event ${i + 1}`;
      const status = parseTrackingStatus(raw?.status);
      // Whether the pharmacy can supply an order is not something a courier knows.
      if (!status || status === 'CANNOT_FULFIL') throw new BadRequestException(`${at}: unknown status. Use one of ${TRACKING_STATUSES.filter((x) => x !== 'CANNOT_FULFIL').join(', ')}`);
      const reference = text(raw.reference, 100);
      const trackingNumber = text(raw.trackingNumber, 100);
      if (!reference && !trackingNumber) throw new BadRequestException(`${at}: send "reference" (our order id) or "trackingNumber"`);
      const url = text(raw.trackingUrl, 500);
      if (url && !/^https?:\/\//i.test(url)) throw new BadRequestException(`${at}: "trackingUrl" must start with http:// or https://`);
      return {
        reference,
        trackingNumber,
        status,
        occurredAt: date(raw.occurredAt, 'occurredAt') ?? new Date(),
        externalId: text(raw.eventId, 100),
        location: text(raw.location, 200),
        note: text(raw.note, 500),
        carrier: text(raw.carrier, 100),
        trackingUrl: url,
        estimatedDeliveryFrom: date(raw.estimatedDeliveryFrom, 'estimatedDeliveryFrom'),
        estimatedDeliveryTo: date(raw.estimatedDeliveryTo, 'estimatedDeliveryTo'),
      };
    });
  }
}
