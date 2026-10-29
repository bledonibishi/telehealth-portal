import Link from 'next/link';

/** The white panel every dashboard block sits on. */
export function Card({ children, className = '', labelledBy, guide }: { children: React.ReactNode; className?: string; labelledBy?: string; guide?: string }) {
  return (
    <section aria-labelledby={labelledBy} data-guide={guide} className={`bg-white rounded-2xl border border-slate-200/80 p-5 shadow-[0_1px_2px_rgba(10,56,54,0.04)] ${className}`}>
      {children}
    </section>
  );
}

/** A card's title, with an optional subtitle and a link or button on the right. */
export function CardHeader({ id, title, subtitle, href, action, children }: { id?: string; title: string; subtitle?: string; href?: string; action?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h2 id={id} className="text-sm font-semibold text-ink-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children ?? (href && action && <Link href={href} className="flex-shrink-0 text-xs font-medium text-ink-600 hover:text-ink-700">{action}</Link>)}
    </div>
  );
}

export const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 transition-colors';
export const btnBlue = 'inline-flex items-center justify-center gap-2 rounded-full bg-ink-600 hover:bg-ink-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 transition-colors';
export const btnOutline = 'inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 text-ink-800 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold px-4 py-2 transition-colors';
export const btnSoft = 'inline-flex items-center justify-center gap-2 rounded-full bg-ink-50 hover:bg-ink-100 text-ink-800 text-sm font-semibold px-4 py-2.5 transition-colors';
