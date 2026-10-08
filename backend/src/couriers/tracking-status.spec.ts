import { OrderStatus } from '../common/enums';
import { PROBLEM_STATUSES, orderStatusFor, parseTrackingStatus, rankOf } from './tracking-status';

describe('parseTrackingStatus', () => {
  it('accepts our own names, in any case', () => {
    expect(parseTrackingStatus('DELIVERED')).toBe('DELIVERED');
    expect(parseTrackingStatus('out_for_delivery')).toBe('OUT_FOR_DELIVERY');
    expect(parseTrackingStatus(' Delivery Failed ')).toBe('DELIVERY_FAILED');
  });

  it('reads the spellings couriers commonly use', () => {
    expect(parseTrackingStatus('Out for delivery')).toBe('OUT_FOR_DELIVERY');
    expect(parseTrackingStatus('in-transit')).toBe('IN_TRANSIT');
    expect(parseTrackingStatus('collected')).toBe('PICKED_UP');
    expect(parseTrackingStatus('Returned to sender')).toBe('RETURNED');
    expect(parseTrackingStatus('failed attempt')).toBe('DELIVERY_FAILED');
  });

  it('refuses what it does not know', () => {
    expect(parseTrackingStatus('teleported')).toBeNull();
    expect(parseTrackingStatus('')).toBeNull();
    expect(parseTrackingStatus(undefined)).toBeNull();
    expect(parseTrackingStatus(42)).toBeNull();
  });
});

describe('orderStatusFor', () => {
  it('carries the order forward only for the steps that move it', () => {
    expect(orderStatusFor('PICKED_UP')).toBe(OrderStatus.DISPATCHED);
    expect(orderStatusFor('IN_TRANSIT')).toBe(OrderStatus.DISPATCHED);
    expect(orderStatusFor('OUT_FOR_DELIVERY')).toBe(OrderStatus.OUT_FOR_DELIVERY);
    expect(orderStatusFor('DELIVERED')).toBe(OrderStatus.DELIVERED);
  });

  it('leaves problems and "ready" as history only', () => {
    for (const s of ['READY_FOR_PICKUP', 'DELIVERY_FAILED', 'RETURNED', 'EXCEPTION', 'CANNOT_FULFIL'] as const) expect(orderStatusFor(s)).toBeNull();
  });

  it('ranks the order statuses front to back', () => {
    expect(rankOf('PENDING')).toBeLessThan(rankOf('DISPATCHED'));
    expect(rankOf('DISPATCHED')).toBeLessThan(rankOf('OUT_FOR_DELIVERY'));
    expect(rankOf('OUT_FOR_DELIVERY')).toBeLessThan(rankOf('DELIVERED'));
    expect(rankOf('CANCELLED')).toBe(-1);
  });
});

describe('problem statuses', () => {
  it('count the pharmacy being unable to supply an order as a problem for staff', () => {
    expect(PROBLEM_STATUSES).toEqual(expect.arrayContaining(['DELIVERY_FAILED', 'RETURNED', 'EXCEPTION', 'CANNOT_FULFIL']));
  });
});
