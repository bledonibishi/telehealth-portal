'use client';

import Link from 'next/link';
import { useCareStage } from '@/lib/useCareStage';
import { Card, btnPrimary, btnSoft } from './Card';
import { Icon, type IconName } from './Icon';

/**
 * What a page shows when it has nothing of its own yet. It always says why and what happens next: while the
 * patient isn't being treated yet, that comes from where they are on the way there (the same on every
 * page); once they are, the page gives its own reason through `whenTreating`.
 */
export function EmptyState({ icon, what, whenTreating }: {
  icon: IconName;
  /** What will appear here, e.g. "Your injection schedule". */
  what: string;
  /** Shown to a patient who has a prescription but still nothing here. */
  whenTreating: { text: string; action?: { href: string; label: string } };
}) {
  const next = useCareStage();
  if (next.stage === 'LOADING') return <Card><div className="h-28 rounded-xl bg-slate-50 animate-pulse" role="status" aria-label="Loading" /></Card>;
  const treating = next.stage === 'TREATING';
  const title = treating ? `${what} isn’t ready yet` : next.title;
  const text = treating ? whenTreating.text : `${what} appears here once your treatment starts. ${next.text}`;
  const action = treating ? whenTreating.action : next.action;
  return (
    <Card>
      <div className="flex flex-col items-center text-center py-6 max-w-md mx-auto">
        <span className="w-12 h-12 rounded-full bg-ink-50 text-ink-700 flex items-center justify-center mb-3"><Icon name={icon} /></span>
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-1.5">{text}</p>
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {action && <Link href={action.href} className={btnPrimary}>{action.label}</Link>}
          <Link href="/messages" className={btnSoft}><Icon name="chat" className="w-4 h-4" /> Ask your care team</Link>
        </div>
      </div>
    </Card>
  );
}
