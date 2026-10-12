import { format } from 'date-fns';
import { feelingOf, kg, kgChange } from '@/lib/weight';

/** Start + one row per check-in. Stacked cards on a phone, a timeline rail from `sm` up. */
export function WeightHistory({ starting, entries }: { starting?: number | null; entries: any[] }) {
  return (
    <ol className="relative border-l-2 border-slate-100 ml-2 space-y-4">
      {[...entries].reverse().map((e) => {
        const feeling = feelingOf(e.feeling);
        return (
          <li key={e.checkInId} className="pl-5 relative">
            <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-brand-600 ring-4 ring-white" />
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">Month {e.month}</p>
              <p className="text-xs text-slate-400">{format(new Date(e.date), 'd MMM yyyy')}</p>
            </div>
            <p className="text-lg font-semibold text-slate-900">
              {kg(e.weightKg)} <span className="text-xs font-normal text-slate-400">{kgChange(e.changeKg)}</span>
            </p>
            {feeling && (
              <p className="text-sm text-slate-600">
                <span aria-hidden>{feeling.emoji}</span> {feeling.label}
              </p>
            )}
            {e.note && <p className="text-sm text-slate-500 mt-1 italic">&ldquo;{e.note}&rdquo;</p>}
          </li>
        );
      })}
      <li className="pl-5 relative">
        <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-slate-300 ring-4 ring-white" />
        <p className="text-sm font-semibold text-slate-900">Start</p>
        <p className="text-lg font-semibold text-slate-900">{kg(starting)}</p>
      </li>
    </ol>
  );
}
