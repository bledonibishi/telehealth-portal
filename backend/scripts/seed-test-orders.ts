/**
 * Dev only: creates test orders in every stage, on the active prescriptions already in the database, so the pharmacy
 * and admin screens can be tried without going through checkout each time.
 *
 *   cd backend
 *   pnpm seed-test-orders            # replaces any earlier test orders with fresh ones and lists them
 *   pnpm seed-test-orders --clear    # removes the test orders again
 *
 * Test orders are the ones whose pharmacy reference starts with "TEST-"; nothing else is touched. Uses DATABASE_URL
 * from the environment, or else from backend/.env, and refuses to run against a database that isn't on this machine.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import { Prisma, PrismaClient } from '@prisma/client';

const PREFIX = 'TEST-';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const code = (id: string) => `TH-${id.slice(-8).toUpperCase()}`;

type Event = { status: string; hoursAgo: number; note?: string; location?: string; source?: 'MANUAL' | 'WEBHOOK' };
type Stage = {
  key: string;
  /** What to try with it. */
  hint: string;
  /** Wants a cold-chain prescription when there is one. */
  cold?: boolean;
  order: (now: number) => Partial<Prisma.OrderUncheckedCreateInput>;
  events?: Event[];
};

const courier = { carrier: 'Posta BEKI', trackingUrl: 'https://example.com/track/BK-TEST' };
const at = (now: number, ms: number) => new Date(now - ms);

const STAGES: Stage[] = [
  { key: 'TO_PACK_COLD', cold: true, hint: 'To pack, cold chain: print the packing slip (blue cold-chain notice), copy the code, press Ready for pickup', order: (n) => ({ status: 'PENDING', createdAt: at(n, 3 * HOUR) }) },
  { key: 'TO_PACK', hint: 'To pack: try Can’t fulfil as the pharmacy; as admin try Cancel order', order: (n) => ({ status: 'PENDING', createdAt: at(n, 1 * DAY) }) },
  { key: 'READY', hint: 'Ready for pickup: press Handed to courier as the pharmacy', order: (n) => ({ status: 'PENDING', createdAt: at(n, 1 * DAY), readyForPickupAt: at(n, 2 * HOUR) }), events: [{ status: 'READY_FOR_PICKUP', hoursAgo: 2 }] },
  {
    key: 'SHIPPED',
    hint: 'Shipped: as admin Edit courier and tracking, then send out_for_delivery with the webhook',
    order: (n) => ({ status: 'DISPATCHED', createdAt: at(n, 2 * DAY), readyForPickupAt: at(n, 1 * DAY + 3 * HOUR), dispatchedAt: at(n, 1 * DAY), ...courier, trackingNumber: 'BK-TEST-1001', estimatedDeliveryFrom: new Date(n + 1 * DAY), estimatedDeliveryTo: new Date(n + 2 * DAY) }),
    events: [{ status: 'READY_FOR_PICKUP', hoursAgo: 27 }, { status: 'PICKED_UP', hoursAgo: 24 }, { status: 'IN_TRANSIT', hoursAgo: 20, location: 'Prishtinë depot', source: 'WEBHOOK' }],
  },
  {
    key: 'OUT',
    hint: 'Out for delivery: as admin press Mark delivered, or send delivered with the webhook',
    order: (n) => ({ status: 'OUT_FOR_DELIVERY', createdAt: at(n, 2 * DAY), dispatchedAt: at(n, 1 * DAY), outForDeliveryAt: at(n, 2 * HOUR), ...courier, trackingNumber: 'BK-TEST-1002', estimatedDeliveryFrom: new Date(n), estimatedDeliveryTo: new Date(n) }),
    events: [{ status: 'PICKED_UP', hoursAgo: 24 }, { status: 'OUT_FOR_DELIVERY', hoursAgo: 2, source: 'WEBHOOK' }],
  },
  {
    key: 'OVERDUE',
    hint: 'Overdue: past its expected date, so it shows the amber warning and is under Problems',
    order: (n) => ({ status: 'DISPATCHED', createdAt: at(n, 8 * DAY), dispatchedAt: at(n, 6 * DAY), ...courier, trackingNumber: 'BK-TEST-1003', estimatedDeliveryFrom: new Date(n - 4 * DAY), estimatedDeliveryTo: new Date(n - 3 * DAY) }),
    events: [{ status: 'PICKED_UP', hoursAgo: 144 }],
  },
  {
    key: 'FAILED',
    hint: 'Delivery failed: red banner and Problems tab; the patient page shows a gentle note',
    order: (n) => ({ status: 'OUT_FOR_DELIVERY', createdAt: at(n, 3 * DAY), dispatchedAt: at(n, 2 * DAY), outForDeliveryAt: at(n, 6 * HOUR), ...courier, trackingNumber: 'BK-TEST-1004' }),
    events: [{ status: 'PICKED_UP', hoursAgo: 48 }, { status: 'OUT_FOR_DELIVERY', hoursAgo: 6, source: 'WEBHOOK' }, { status: 'DELIVERY_FAILED', hoursAgo: 4, note: 'Recipient not at home', location: 'Prishtinë', source: 'WEBHOOK' }],
  },
  {
    key: 'CANNOT_FULFIL',
    hint: 'Pharmacy can’t fulfil: appears under Problems for admin, who decides whether to cancel and refund',
    order: (n) => ({ status: 'PENDING', createdAt: at(n, 2 * DAY) }),
    events: [{ status: 'CANNOT_FULFIL', hoursAgo: 5, note: 'Out of stock until next week' }],
  },
  {
    key: 'DELIVERED',
    hint: 'Delivered: collapsed to one line, “Show details” opens it',
    order: (n) => ({ status: 'DELIVERED', createdAt: at(n, 6 * DAY), dispatchedAt: at(n, 5 * DAY), outForDeliveryAt: at(n, 4 * DAY + 3 * HOUR), deliveredAt: at(n, 4 * DAY), ...courier, trackingNumber: 'BK-TEST-1005' }),
    events: [{ status: 'PICKED_UP', hoursAgo: 120 }, { status: 'IN_TRANSIT', hoursAgo: 110, source: 'WEBHOOK' }, { status: 'OUT_FOR_DELIVERY', hoursAgo: 99, source: 'WEBHOOK' }, { status: 'DELIVERED', hoursAgo: 96, source: 'WEBHOOK' }],
  },
  { key: 'CANCELLED', hint: 'Cancelled: greyed out with the reason', order: (n) => ({ status: 'CANCELLED', createdAt: at(n, 5 * DAY), cancelledAt: at(n, 4 * DAY), cancelReason: 'Patient asked to stop treatment' }) },
];

async function main() {
  const envFile = resolve(__dirname, '../.env');
  if (!process.env.DATABASE_URL && existsSync(envFile)) {
    (process as unknown as { loadEnvFile(path: string): void }).loadEnvFile(envFile);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('Not available in production.');
    process.exit(1);
  }
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname;
  if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
    console.error(`DATABASE_URL points at "${host}", not this machine. Refusing to write test orders there.`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const old = await prisma.order.findMany({ where: { pharmacyRef: { startsWith: PREFIX } }, select: { id: true } });
    if (old.length > 0) {
      const ids = old.map((o) => o.id);
      await prisma.$transaction([
        prisma.orderTrackingEvent.deleteMany({ where: { orderId: { in: ids } } }),
        prisma.partnerTransmission.deleteMany({ where: { orderId: { in: ids } } }),
        prisma.order.deleteMany({ where: { id: { in: ids } } }),
      ]);
      console.log(`Removed ${old.length} earlier test order(s).`);
    }
    if (process.argv.includes('--clear')) return;

    const prescriptions = await prisma.prescription.findMany({
      where: { status: 'ACTIVE', patient: { addressLine1: { not: null }, city: { not: null }, postcode: { not: null }, country: { not: null } } },
      include: { patient: true, items: { include: { product: true } } },
      orderBy: { issuedAt: 'asc' },
    });
    if (prescriptions.length === 0) {
      console.error('No active prescription for a patient with a delivery address. Run the seed or create a patient first.');
      process.exit(1);
    }

    const now = Date.now();
    const rows: Array<{ stage: string; patient: string; code: string; hint: string }> = [];
    let next = 0;
    for (const stage of STAGES) {
      const rx = (stage.cold && prescriptions.find((p) => p.items.some((i) => i.product.requiresColdChain))) || prescriptions[next++ % prescriptions.length];
      const last = await prisma.order.findFirst({ where: { prescriptionId: rx.id }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
      const p = rx.patient;
      const snapshot = {
        name: `${p.firstName} ${p.lastName}`, phone: p.phone, addressLine1: p.addressLine1, addressLine2: p.addressLine2, city: p.city, postcode: p.postcode, country: p.country,
      } as Prisma.InputJsonValue;
      const data = stage.order(now);
      const created = await prisma.order.create({
        data: {
          prescriptionId: rx.id,
          patientId: p.id,
          sequence: (last?.sequence ?? 0) + 1,
          pharmacyRef: `${PREFIX}${stage.key}`,
          // The address is copied onto an order when it ships, not before.
          ...(data.status && data.status !== 'PENDING' && data.status !== 'CANCELLED' ? { shippingAddress: snapshot } : {}),
          ...data,
        } as Prisma.OrderUncheckedCreateInput,
      });
      for (const e of stage.events ?? []) {
        await prisma.orderTrackingEvent.create({
          data: { orderId: created.id, status: e.status, occurredAt: new Date(now - e.hoursAgo * HOUR), note: e.note, location: e.location, source: e.source ?? 'MANUAL' },
        });
      }
      rows.push({ stage: stage.key, patient: `${p.firstName} ${p.lastName}`, code: code(created.id), hint: stage.hint });
    }

    console.log(`\nCreated ${rows.length} test orders. Log in as provider@clinic.dev (pharmacy) or admin@clinic.dev, open Orders:\n`);
    console.table(rows.map((r) => ({ stage: r.stage, patient: r.patient, 'parcel code': r.code })));
    for (const r of rows) console.log(`• ${r.stage.padEnd(14)} ${r.code}  ${r.hint}`);
    console.log('\nTo remove them again: pnpm seed-test-orders --clear');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
