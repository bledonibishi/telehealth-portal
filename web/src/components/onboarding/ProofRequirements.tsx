'use client';

export type ProofRequirementsData = {
  name?: string | null;
  medicine?: string | null;
  dose?: string | null;
  notBefore: string; // YYYY-MM-DD
};

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * What this patient's proof has to show to be accepted — their name, the medicine and dose they
 * told us, and a recent date — numbered like the details outlined in the example photos.
 */
export function ProofRequirements({ data, compact = false }: { data: ProofRequirementsData; compact?: boolean }) {
  const rows: { n: number; label: string; short: string; value: string }[] = [
    { n: 1, label: 'Your name', short: 'Name', value: data.name ?? 'Your full name' },
    { n: 2, label: 'Medicine', short: 'Medicine', value: data.medicine ?? 'The medicine you used' },
    { n: 3, label: 'Dose', short: 'Dose', value: data.dose ?? 'The dose you were on' },
    { n: 4, label: 'Date', short: 'Date', value: `On or after ${formatDate(data.notBefore)}` },
  ];

  if (compact) {
    return (
      <div className="mt-3 rounded-md border border-ink-100 bg-white px-3.5 py-3">
        <p className="text-xs font-semibold text-ink-900">Your proof needs to show</p>
        <dl className="mt-2 grid grid-cols-[auto_auto_1fr] items-center gap-x-2.5 gap-y-1.5">
          {rows.map((r) => (
            <div key={r.n} className="contents">
              <span className="w-[18px] h-[18px] rounded-full bg-ink-700 text-white text-[10px] font-bold flex items-center justify-center">
                {r.n}
              </span>
              <dt className="text-xs text-slate-500 pr-2">{r.short}</dt>
              <dd className="text-sm font-semibold text-slate-900 truncate">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="mt-5 bg-white rounded-lg border border-ink-100">
      <p className="px-4 pt-4 pb-1 text-xs font-semibold text-ink-900 uppercase tracking-wide">Your proof needs to show</p>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.n} className="flex items-center gap-3 px-4 py-3">
            <span className="w-6 h-6 rounded-full bg-ink-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{r.n}</span>
            <span className="text-sm text-slate-500 w-20 flex-shrink-0">{r.label}</span>
            <span className="text-sm font-semibold text-slate-900 min-w-0">{r.value}</span>
          </li>
        ))}
      </ul>
      <p className="px-4 pb-4 pt-1 text-xs text-slate-500">All four on one document — for example the pharmacy label on your box or pen.</p>
    </div>
  );
}
