'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@apollo/client';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { CX_WORK_QUEUE, MARK_LEAD_CONTACTED, STOP_LEAD_FOLLOW_UP } from '@/graphql/cx';
import PatientChatWindow from '@/components/patients/PatientChatWindow';

type Kind = 'REPLY' | 'LEAD' | 'ACTIVATION' | 'ONBOARDING';

type Task = {
  id: string;
  kind: Kind;
  name: string;
  email: string;
  phone?: string | null;
  programme?: string | null;
  since: string;
  patientId?: string | null;
  leadId?: string | null;
  sentBack: boolean;
  lastContactedAt?: string | null;
  lastContactedBy?: string | null;
};

const HOUR = 3_600_000;

// The four jobs, in the order they should be done: someone who wrote to us comes before someone we are chasing.
// `amber` and `red` are how many hours a wait may last before it is coloured.
const KINDS: Record<Kind, { label: string; hint: string; icon: string; chip: string; amber: number; red: number }> = {
  REPLY:      { label: 'Messages to answer', hint: 'Patients waiting for a reply',    icon: '💬', chip: 'bg-sky-500/15 text-sky-300',         amber: 4,   red: 24 },
  ONBOARDING: { label: 'Onboarding stuck',   hint: 'ID or photos not finished',       icon: '🪪', chip: 'bg-orange-500/15 text-orange-300',   amber: 96,  red: 240 },
  ACTIVATION: { label: 'Not activated',      hint: 'Paid, but never signed in',       icon: '🔑', chip: 'bg-amber-500/15 text-amber-300',     amber: 72,  red: 168 },
  LEAD:       { label: 'Leads to follow up', hint: 'Finished the quiz, did not pay',  icon: '🎯', chip: 'bg-teal-500/15 text-teal-300',       amber: 72,  red: 240 },
};
const ORDER: Kind[] = ['REPLY', 'ONBOARDING', 'ACTIVATION', 'LEAD'];

const KIND_LABEL: Record<string, string> = { HRT: 'HRT', GLP1: 'GLP-1', TRT: 'TRT' };

const waitTone = (task: Task) => {
  const hours = (Date.now() - new Date(task.since).getTime()) / HOUR;
  if (hours >= KINDS[task.kind].red) return 'text-red-400';
  if (hours >= KINDS[task.kind].amber) return 'text-amber-400';
  return 'text-[color:var(--t-muted)]';
};

const initials = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const btn = 'inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50';
const btnPrimary = `${btn} bg-sky-500 text-white hover:bg-sky-400`;
const btnGhost = `${btn} border border-[color:var(--border)] text-[color:var(--t-body)] hover:bg-[color:var(--bg-hover)]`;
const card = 'rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-card)]';

/**
 * The CX team's home: one list of everyone waiting on them, longest wait first, with the one action each needs.
 * The four cards on top count the list by job and filter it.
 */
export default function CxDashboard() {
  const { t, timeAgo, fmt } = useI18n();
  const router = useRouter();
  const { data, loading, error, refetch } = useQuery(CX_WORK_QUEUE, { pollInterval: 30_000, fetchPolicy: 'cache-and-network' });
  const [markContacted, { loading: marking }] = useMutation(MARK_LEAD_CONTACTED);
  const [stopFollowUp, { loading: stopping }] = useMutation(STOP_LEAD_FOLLOW_UP);
  const [filter, setFilter] = useState<Kind | null>(null);
  const [search, setSearch] = useState('');
  const [chat, setChat] = useState<Task | null>(null);
  // Closing a lead can't be undone from here, so the button asks once more.
  const [confirmStop, setConfirmStop] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const queue = data?.cxWorkQueue;
  const tasks: Task[] = queue?.tasks ?? [];

  const byKind = useMemo(() => {
    const groups: Record<Kind, Task[]> = { REPLY: [], ONBOARDING: [], ACTIVATION: [], LEAD: [] };
    tasks.forEach((task) => groups[task.kind]?.push(task));
    return groups;
  }, [tasks]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter((task) => (!filter || task.kind === filter) && (!q || task.name.toLowerCase().includes(q) || task.email.toLowerCase().includes(q)))
      // By job first, then the longest wait (the server already sends the longest wait first).
      .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  }, [tasks, filter, search]);

  const leadAction = async (run: typeof markContacted, leadId: string) => {
    setActionError(null);
    try {
      await run({ variables: { leadId } });
      setConfirmStop(null);
      await refetch();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const openProfile = (patientId: string) => router.push(`/patients?patient=${encodeURIComponent(patientId)}`);

  const describe = (task: Task): string => {
    switch (task.kind) {
      case 'REPLY': return t('Wrote to us and is waiting for a reply');
      case 'ONBOARDING': return task.sentBack ? t('The doctor asked for a step to be sent again') : t('Has not finished the ID and photos');
      case 'ACTIVATION': return t('Paid, but has not activated the account');
      case 'LEAD':
        return task.lastContactedAt
          ? t('Not paid yet · contacted {when} by {name}', { when: timeAgo(task.lastContactedAt), name: task.lastContactedBy ?? t('the team') })
          : t('Finished the quiz but has not paid');
    }
  };

  const paidPct = queue?.leadsThisWeek ? Math.round((queue.paidThisWeek / queue.leadsThisWeek) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto bg-[color:var(--bg-page)] text-[color:var(--t-body)]">
      <div className="mx-auto max-w-7xl space-y-4 p-3 sm:p-5">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--t-strong)]">{t('CX dashboard')}</h1>
          <p className="mt-0.5 text-xs text-[color:var(--t-dim)]">
            {fmt(new Date(), 'PPPP')}
            {queue && <> · {tasks.length === 0 ? t('Nobody is waiting') : t('{n} people are waiting for you', { n: tasks.length })}</>}
          </p>
        </div>

        {/* The four jobs: each card is a count and a filter. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ORDER.map((kind) => {
            const list = byKind[kind];
            const active = filter === kind;
            return (
              <button
                key={kind}
                onClick={() => setFilter(active ? null : kind)}
                aria-pressed={active}
                className={`rounded-xl border px-4 py-3 text-left transition-colors hover:border-[color:var(--border-strong)] ${
                  active ? 'border-sky-400 bg-[color:var(--bg-hover)]' : 'border-[color:var(--border)] bg-[color:var(--bg-card)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-[color:var(--t-muted)]">{t(KINDS[kind].label)}</p>
                  <span aria-hidden>{KINDS[kind].icon}</span>
                </div>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-[color:var(--t-strong)]">{queue ? list.length : '—'}</p>
                <p className={`mt-0.5 truncate text-[11px] ${list[0] ? waitTone(list[0]) : 'text-[color:var(--t-dim)]'}`}>
                  {list[0] ? t('Longest wait: {when}', { when: timeAgo(list[0].since) }) : t(KINDS[kind].hint)}
                </p>
              </button>
            );
          })}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* The work list */}
          <section className={`${card} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border-subtle)] px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[color:var(--t-strong)]">{filter ? t(KINDS[filter].label) : t('To do now')}</h2>
                {filter && (
                  <button onClick={() => setFilter(null)} className="text-xs text-sky-400 hover:underline">{t('Show everything')}</button>
                )}
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search by name or email…')}
                className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-panel)] px-3 py-1.5 text-sm text-[color:var(--t-strong)] placeholder:text-[color:var(--t-dim)] focus:outline-none focus:ring-2 focus:ring-sky-500 sm:w-64"
              />
            </div>

            {actionError && <p className="px-4 py-3 text-sm text-red-400">{actionError}</p>}
            {error && (
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <p className="text-sm text-red-400">{t('Could not load the list.')} <span className="text-[color:var(--t-dim)]">({error.message})</span></p>
                <button className={btnGhost} onClick={() => refetch()}>{t('Try again')}</button>
              </div>
            )}
            {loading && !queue && <p className="px-4 py-8 text-center text-sm text-[color:var(--t-dim)]">{t('Loading…')}</p>}
            {queue && shown.length === 0 && (
              <div className="px-4 py-12 text-center">
                <p className="text-sm font-medium text-[color:var(--t-strong)]">{tasks.length === 0 ? t('All caught up 🎉') : t('Nothing matches')}</p>
                <p className="mt-1 text-xs text-[color:var(--t-dim)]">
                  {tasks.length === 0 ? t('New messages and leads will appear here on their own.') : t('Try another name, or show everything.')}
                </p>
              </div>
            )}

            <ul className="divide-y divide-[color:var(--border-subtle)]">
              {shown.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 hover:bg-[color:var(--bg-subtle)]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--bg-hover)] text-xs font-semibold text-[color:var(--t-strong)]">
                    {initials(task.name)}
                  </span>

                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-medium text-[color:var(--t-strong)]">{task.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${KINDS[task.kind].chip}`}>{t(KINDS[task.kind].label)}</span>
                      {task.programme && <span className="text-[11px] text-[color:var(--t-dim)]">{KIND_LABEL[task.programme] ?? task.programme}</span>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[color:var(--t-muted)]">{describe(task)}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[color:var(--t-dim)]">
                      {task.email}
                      {task.phone && <> · <a href={`tel:${task.phone}`} className="hover:underline">{task.phone}</a></>}
                    </p>
                  </div>

                  <span className={`shrink-0 text-xs font-medium ${waitTone(task)}`} title={fmt(task.since, 'PPp')}>
                    {timeAgo(task.since)}
                  </span>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {task.kind === 'REPLY' && (
                      <button className={btnPrimary} onClick={() => setChat(task)}>{t('Reply')}</button>
                    )}
                    {task.kind === 'ONBOARDING' && (
                      <button className={btnPrimary} onClick={() => setChat(task)}>{t('Message')}</button>
                    )}
                    {task.kind === 'ACTIVATION' && (
                      <a className={btnPrimary} href={`mailto:${task.email}`}>{t('Email')}</a>
                    )}
                    {task.patientId && (
                      <button className={btnGhost} onClick={() => openProfile(task.patientId!)}>{t('Profile')}</button>
                    )}
                    {task.kind === 'LEAD' && task.leadId && (
                      confirmStop === task.id ? (
                        <>
                          <span className="text-xs text-[color:var(--t-muted)]">{t('Never contact again?')}</span>
                          <button className={`${btn} bg-red-500 text-white hover:bg-red-400`} disabled={stopping} onClick={() => leadAction(stopFollowUp, task.leadId!)}>{t('Yes, close')}</button>
                          <button className={btnGhost} onClick={() => setConfirmStop(null)}>{t('Cancel')}</button>
                        </>
                      ) : (
                        <>
                          <a className={btnGhost} href={`mailto:${task.email}`}>{t('Email')}</a>
                          <button className={btnPrimary} disabled={marking} onClick={() => leadAction(markContacted, task.leadId!)}>{t('Mark contacted')}</button>
                          <button className={btnGhost} onClick={() => setConfirmStop(task.id)}>{t('Not interested')}</button>
                        </>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <aside className="space-y-4">
            <section className={`${card} p-4`}>
              <h2 className="text-sm font-semibold text-[color:var(--t-strong)]">{t('Last 7 days')}</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ['New leads', queue?.leadsThisWeek],
                  ['Of those, paid', queue?.paidThisWeek],
                  ['Accounts activated', queue?.activatedThisWeek],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-baseline justify-between">
                    <dt className="text-[color:var(--t-muted)]">{t(label as string)}</dt>
                    <dd className="font-semibold tabular-nums text-[color:var(--t-strong)]">{value ?? '—'}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-hover)]" aria-hidden>
                <div className="h-full rounded-full bg-[color:var(--chart-target)]" style={{ width: `${paidPct}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-[color:var(--t-dim)]">{t('{pct}% of this week’s leads have paid', { pct: paidPct })}</p>
            </section>

            <section className={`${card} p-4`}>
              <h2 className="text-sm font-semibold text-[color:var(--t-strong)]">{t('When to hand over')}</h2>
              <ul className="mt-3 space-y-2.5 text-xs text-[color:var(--t-muted)]">
                <li><span className="font-medium text-[color:var(--t-strong)]">{t('To the doctor')}</span> — {t('side effects, symptoms, doses, anything about a medicine. Never give medical advice.')}</li>
                <li><span className="font-medium text-[color:var(--t-strong)]">{t('To an admin')}</span> — {t('refunds, cancelled or lost orders, payment disputes.')}</li>
                <li><span className="font-medium text-red-400">{t('Emergency')}</span> — {t('chest pain, trouble breathing or a severe reaction: tell them to call 112 now, then alert the doctor.')}</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>

      {chat?.patientId && (
        <PatientChatWindow
          key={chat.patientId}
          patientId={chat.patientId}
          patientName={chat.name}
          onClose={() => setChat(null)}
          onOpenProfile={() => openProfile(chat.patientId!)}
          onActivity={() => refetch()}
        />
      )}
    </div>
  );
}
