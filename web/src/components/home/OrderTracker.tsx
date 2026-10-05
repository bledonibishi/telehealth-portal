import { format } from 'date-fns';

const STAGES = ['Processing', 'Shipped', 'On the way', 'Delivered'] as const;
const STAGE_OF: Record<string, number> = { PENDING: 0, DISPATCHED: 1, OUT_FOR_DELIVERY: 2, DELIVERED: 3 };
const WHEN: Array<keyof Order> = ['createdAt', 'dispatchedAt', 'outForDeliveryAt', 'deliveredAt'];

type Order = { status: string; createdAt?: string | null; dispatchedAt?: string | null; outForDeliveryAt?: string | null; deliveredAt?: string | null };

/** Where one order is: a line of dots from processing to delivered, with the date each step happened. */
export function OrderTracker({ order }: { order: Order }) {
  const current = STAGE_OF[order.status] ?? 0;
  return (
    <ol className="grid grid-cols-4" aria-label="Order progress">
      {STAGES.map((stage, i) => {
        const at = order[WHEN[i]] as string | null | undefined;
        return (
          <li key={stage} className="relative flex flex-col items-center text-center" aria-current={i === current ? 'step' : undefined}>
            {i < STAGES.length - 1 && <span className={`absolute top-[6px] left-1/2 w-full h-0.5 ${i < current ? 'bg-ink-700' : 'bg-slate-200'}`} aria-hidden />}
            <span className={`relative w-3.5 h-3.5 rounded-full border-2 ${i <= current ? 'bg-ink-700 border-ink-700' : 'bg-white border-slate-300'} ${i === current ? 'ring-4 ring-ink-100' : ''}`} />
            <span className={`text-[10px] sm:text-[11px] mt-1.5 px-0.5 leading-tight ${i <= current ? 'text-ink-900 font-medium' : 'text-slate-400'}`}>{stage}</span>
            {at && i <= current && <span className="text-[10px] text-slate-400">{format(new Date(at), 'd MMM')}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Processing', cls: 'bg-amber-50 text-amber-700' },
  DISPATCHED: { label: 'Shipped', cls: 'bg-emerald-50 text-emerald-700' },
  OUT_FOR_DELIVERY: { label: 'On the way', cls: 'bg-emerald-50 text-emerald-700' },
  DELIVERED: { label: 'Delivered', cls: 'bg-ink-50 text-ink-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500' },
};
