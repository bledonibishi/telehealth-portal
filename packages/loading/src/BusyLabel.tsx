import { Spinner } from './Spinner';

/**
 * The inside of a button that is doing something: a spinner and the busy wording while `busy`, the normal content otherwise.
 *
 *   <button disabled={saving}><BusyLabel busy={saving} busyText={t('Saving…')}>{t('Save')}</BusyLabel></button>
 */
export function BusyLabel({ busy, busyText, children }: { busy: boolean; busyText?: React.ReactNode; children: React.ReactNode }) {
  if (!busy) return <>{children}</>;
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <Spinner size="sm" className="text-current" />
      {busyText ?? children}
    </span>
  );
}
