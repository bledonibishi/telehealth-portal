import { useI18n } from '@/lib/i18n/I18nProvider';
function FlagIcon({ className }: { className: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

export function RedFlagBanner({ redFlags }: { redFlags: Array<{ id: string; description: string; severity: string }> }) {
  const { t } = useI18n();
  if (redFlags.length === 0) return null;

  const critical = redFlags.filter((f) => f.severity === 'CRITICAL');
  const warnings = redFlags.filter((f) => f.severity === 'WARNING');

  // One card, critical first: each flag once, in a line, so the doctor reads all of them before deciding.
  return (
    <section data-guide="consultation:flags" aria-label={t('Clinical flags')} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <h2 className="border-b border-gray-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {t('Clinical flags')} · {redFlags.length}
      </h2>
      <ul className="divide-y divide-gray-100">
        {[...critical, ...warnings].map((f) => {
          const isCritical = f.severity === 'CRITICAL';
          return (
            <li key={f.id} className={`flex items-start gap-3 px-4 py-2.5 ${isCritical ? 'bg-danger-50' : ''}`}>
              <FlagIcon className={`mt-0.5 h-4 w-4 shrink-0 ${isCritical ? 'text-danger-500' : 'text-warn-500'}`} />
              <p className="text-sm">
                <span className={`mr-2 text-[11px] font-semibold uppercase tracking-wide ${isCritical ? 'text-danger-500' : 'text-warn-900'}`}>{isCritical ? t('Critical') : t('Warning')}</span>
                <span className={isCritical ? 'font-medium text-danger-900' : 'text-gray-800'}>{f.description}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
