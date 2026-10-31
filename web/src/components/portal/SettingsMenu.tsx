import Link from 'next/link';
import { Icon, type IconName } from '@/components/portal/Icon';
import { PageHeader } from '@/components/portal/PageHeader';

/** A titled group of rows on the Settings menu. */
export function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <ul className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(10,56,54,0.04)] divide-y divide-slate-100 overflow-hidden">
        {children}
      </ul>
    </section>
  );
}

const row = 'flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors';

function RowText({ label, hint, danger }: { label: string; hint?: string; danger?: boolean }) {
  return (
    <span className="min-w-0 flex-1">
      <span className={`block text-sm font-medium ${danger ? 'text-rose-700' : 'text-ink-900'}`}>{label}</span>
      {hint && <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>}
    </span>
  );
}

/** One row of the Settings menu: a link to a page, or a button (sign out). */
export function SettingsRow({ href, onClick, icon, label, hint, danger }: { href?: string; onClick?: () => void; icon: IconName; label: string; hint?: string; danger?: boolean }) {
  const glyph = <Icon name={icon} className={`w-5 h-5 flex-shrink-0 ${danger ? 'text-rose-600' : 'text-ink-700'}`} />;
  return (
    <li>
      {href ? (
        <Link href={href} className={row}>
          {glyph}
          <RowText label={label} hint={hint} />
          <Icon name="right" className="w-4 h-4 text-slate-400 flex-shrink-0" />
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={`${row} w-full text-left`}>
          {glyph}
          <RowText label={label} hint={hint} danger={danger} />
        </button>
      )}
    </li>
  );
}

/** The way back to the Settings menu, above the title of every page the menu opens. */
export function SettingsBackLink() {
  return (
    <Link href="/settings" className="inline-flex items-center gap-1 mb-3 text-sm font-medium text-ink-600 hover:text-ink-800">
      <Icon name="left" className="w-4 h-4" /> Settings
    </Link>
  );
}

/** The frame of a page under Settings: a way back to the menu, the title, then the page's cards. `wide` for a two-column page. */
export function SettingsSubpage({ title, subtitle, wide, children }: { title: string; subtitle?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`px-4 sm:px-6 lg:px-8 pb-8 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
      <SettingsBackLink />
      <PageHeader title={title} subtitle={subtitle} />
      <div className="space-y-5">{children}</div>
    </div>
  );
}
