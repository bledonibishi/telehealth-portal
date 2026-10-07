'use client';

import { format } from 'date-fns';
import { feelingOf } from '@/lib/weight';
import { SITE_LABEL, type InjectionSite } from '@/lib/injection-sites';

type Row = { id: string; scheduledFor: string; status: string; takenAt?: string | null; injectionSite?: string | null; feelingAfter?: string | null; strength: { label: string } };

/** What was taken, when, where it went in and how the patient felt. Newest first. */
export function DoseHistory({ doses, showSite }: { doses: Row[]; showSite: boolean }) {
  const taken = doses.filter((d) => d.status === 'TAKEN' && d.takenAt).sort((a, b) => b.takenAt!.localeCompare(a.takenAt!));
  if (taken.length === 0) return null;
  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-5 mt-6" aria-labelledby="dose-history-title">
      <h2 id="dose-history-title" className="text-base font-semibold text-ink-900 mb-3">Dose history</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400">
              <th className="py-2 pr-4 font-medium">Taken</th>
              <th className="py-2 pr-4 font-medium">Dose</th>
              {showSite && <th className="py-2 pr-4 font-medium">Where</th>}
              <th className="py-2 font-medium">How I felt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {taken.map((d) => {
              const feeling = feelingOf(d.feelingAfter);
              return (
                <tr key={d.id}>
                  <td className="py-2 pr-4 whitespace-nowrap text-slate-700">{format(new Date(d.takenAt!), 'd MMM yyyy, HH:mm')}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-slate-700">{d.strength.label}</td>
                  {showSite && <td className="py-2 pr-4 whitespace-nowrap text-slate-500">{d.injectionSite ? SITE_LABEL[d.injectionSite as InjectionSite] : '—'}</td>}
                  <td className="py-2 text-slate-500">{feeling ? <><span aria-hidden>{feeling.emoji}</span> {feeling.label}</> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
