'use client';

import { useRefill } from '@/lib/useRefill';
import { Icon } from '@/components/portal/Icon';
import { btnOutline, btnPrimary } from '@/components/portal/Card';
import { InlineError } from '@/components/common/Alert';

/**
 * "Order next dose early": asks the doctor for the next supply in one tap. The doctor still approves it
 * (the monthly review is never skipped); the hint says why when it can't be used yet.
 */
export function OrderEarlyButton({ variant = 'primary', label = 'Order Next Dose Early', className = '', fullWidth = false }: { variant?: 'primary' | 'outline'; label?: string; className?: string; fullWidth?: boolean }) {
  const r = useRefill();
  if (!r.status) return null;
  const cls = variant === 'primary' ? btnPrimary : btnOutline;
  return (
    <div className={className}>
      {r.requested ? (
        <p className="inline-flex items-center gap-2 rounded-md bg-emerald-50 text-emerald-800 text-sm font-semibold px-4 py-2.5"><Icon name="check" className="w-4 h-4" /> Refill requested</p>
      ) : !r.canRequest && !r.loading ? null : (
        <button type="button" onClick={r.request} disabled={!r.canRequest || r.loading} className={`${cls} ${fullWidth ? 'w-full !px-3' : 'whitespace-nowrap'}`} title={r.hint ?? undefined}>
          <Icon name="truck" className="w-4 h-4" /> {r.loading ? 'Sending…' : label}
        </button>
      )}
      {/* While it can't be used, only the reason shows, as a quiet line: a disabled button says nothing a patient can act on. */}
      {r.hint && (
        <p className={`text-xs text-slate-600 ${r.canRequest || r.requested ? 'bg-slate-50 rounded-lg px-3 py-2 mt-2 max-w-xs' : 'flex items-start gap-1.5'}`}>
          {!r.canRequest && !r.requested && <Icon name="truck" className="w-3.5 h-3.5 mt-px flex-shrink-0 text-slate-400" />}
          {r.hint}
        </p>
      )}
      <InlineError error={r.error} size="xs" className="mt-1.5" />
    </div>
  );
}
