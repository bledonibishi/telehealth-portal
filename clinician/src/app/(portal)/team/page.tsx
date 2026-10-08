'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { useI18n } from '@/lib/i18n/I18nProvider';
import DoctorPerformance from '@/components/insights/DoctorPerformance';
import {
  GET_CLINICIANS,
  DEACTIVATE_CLINICIAN,
  REACTIVATE_CLINICIAN,
  SEND_CLINICIAN_INVITE,
  DELETE_UNUSED_CLINICIAN,
} from '@/graphql/clinicians';
import { getCurrentUserId } from '@/lib/role';
import { Icon, type IconName } from '@/components/team/icons';
import { ConfirmDialog } from '@/components/team/Modal';
import { AddMemberDialog, EditMemberDialog, type InviteResult } from '@/components/team/MemberDialogs';
import { PRESCRIBING_ROLES, ROLES, ROLE_META } from '@/components/team/roles';

type StatusFilter = 'active' | 'deactivated' | 'all';
type Flash = { tone: 'ok' | 'error'; text: string };
type Pending = { kind: 'deactivate' | 'delete'; clinician: any };

const TONES = {
  neutral: 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
  brand: 'text-brand-500 hover:bg-brand-50',
  green: 'text-green-700 hover:bg-green-50',
  red: 'text-red-600 hover:bg-red-50',
};

/** A square button that is only an icon: its name is the tooltip and what a screen reader says. */
function IconButton({ icon, label, tone = 'neutral', onClick, disabled }: { icon: IconName; label: string; tone?: keyof typeof TONES; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-brand-500 ${TONES[tone]}`}
    >
      <Icon name={icon} className="w-[18px] h-[18px]" />
    </button>
  );
}

function Chip({ icon, children, cls }: { icon?: IconName; children: React.ReactNode; cls: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {icon && <Icon name={icon} className="w-3 h-3" />}
      {children}
    </span>
  );
}

/** Tells the admin what happened to the link: emailed, or (when it could not be) the link itself to pass on. */
function InviteNotice({ result, onClose }: { result: InviteResult; onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const name = `${result.clinician.firstName} ${result.clinician.lastName}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(result.inviteUrl ?? ''); setCopied(true); } catch { /* the link is shown, so it can be selected by hand */ }
  };
  return (
    <div className={`rounded-xl border p-4 mb-4 flex gap-3 ${result.emailSent ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`} role="status">
      <Icon name={result.emailSent ? 'envelope' : 'link'} className={`w-5 h-5 shrink-0 mt-0.5 ${result.emailSent ? 'text-green-700' : 'text-amber-700'}`} />
      <div className="min-w-0 flex-1">
        {result.emailSent ? (
          <p className="text-sm text-green-800">{t('We emailed {name} ({email}) a link to choose their password. It works once and lasts 7 days.', { name, email: result.clinician.email })}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-amber-900">{t('The email could not be sent. Give {name} this link yourself: it works once and lasts 7 days.', { name })}</p>
            <div className="flex gap-2 mt-2">
              <input readOnly value={result.inviteUrl ?? ''} onFocus={(e) => e.currentTarget.select()} className="border border-amber-200 bg-white rounded-lg px-3 py-2 w-full font-mono text-xs" aria-label={t('Invitation link')} />
              <button type="button" onClick={copy} className="shrink-0 text-xs font-medium bg-amber-600 text-white px-3 rounded-lg">{copied ? t('Copied') : t('Copy')}</button>
            </div>
            <p className="text-xs text-amber-800 mt-2">{t('Anyone with this link can set the password for this account, so send it only to them.')}</p>
          </>
        )}
      </div>
      <button type="button" onClick={onClose} aria-label={t('Close')} className="w-7 h-7 shrink-0 rounded-lg text-gray-500 hover:bg-black/5 flex items-center justify-center"><Icon name="close" /></button>
    </div>
  );
}

export default function TeamPage() {
  const { t, timeAgo } = useI18n();
  const { data, loading, error } = useQuery(GET_CLINICIANS);
  const me = getCurrentUserId();

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('active');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; focus?: 'licence' } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<InviteResult | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const opts = { refetchQueries: [{ query: GET_CLINICIANS }] };
  const [deactivate, deactivating] = useMutation(DEACTIVATE_CLINICIAN, opts);
  const [reactivate] = useMutation(REACTIVATE_CLINICIAN, opts);
  const [deleteUnused, deleting] = useMutation(DELETE_UNUSED_CLINICIAN, opts);
  const [sendInvite] = useMutation(SEND_CLINICIAN_INVITE, opts);

  const fullName = (c: any) => `${c.firstName} ${c.lastName}`;

  /** Runs one row action, then says in a line what happened (or why it did not). */
  const run = async (c: any, action: () => Promise<any>, done?: string) => {
    setFlash(null);
    setBusyId(c.id);
    try {
      const result = await action();
      if (done) setFlash({ tone: 'ok', text: done });
      return result;
    } catch (e) {
      setFlash({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusyId(null);
      setPending(null);
    }
  };

  const everyone: any[] = data?.clinicians ?? [];
  const active = everyone.filter((c) => !c.deactivatedAt);
  const deactivatedCount = everyone.length - active.length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return everyone.filter((c) => {
      if (status === 'active' && c.deactivatedAt) return false;
      if (status === 'deactivated' && !c.deactivatedAt) return false;
      if (roleFilter && c.role !== roleFilter) return false;
      return !q || `${c.firstName} ${c.lastName} ${c.email} ${c.specialty ?? ''}`.toLowerCase().includes(q);
    });
  }, [everyone, query, roleFilter, status]);

  const editingClinician = editing ? everyone.find((c) => c.id === editing.id) : null;
  const filtered = !!query.trim() || !!roleFilter || status !== 'active';
  const statusTabs: Array<{ key: StatusFilter; label: string; n: number }> = [
    { key: 'active', label: t('Active'), n: active.length },
    { key: 'deactivated', label: t('Deactivated'), n: deactivatedCount },
    { key: 'all', label: t('All'), n: everyone.length },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('Team & Roles')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('Manage clinician accounts and their access roles')}</p>
        </div>
        <button
          type="button"
          onClick={() => { setAdding(true); setNotice(null); setFlash(null); }}
          className="inline-flex items-center gap-2 text-sm font-medium bg-brand-500 text-white pl-3 pr-4 py-2 rounded-lg hover:bg-brand-900 shadow-sm"
        >
          <Icon name="userPlus" className="w-[18px] h-[18px]" />
          {t('Add member')}
        </button>
      </div>

      {notice && <InviteNotice result={notice} onClose={() => setNotice(null)} />}
      {flash && (
        <div className={`rounded-xl border px-4 py-3 mb-4 flex items-center gap-2 text-sm ${flash.tone === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`} role={flash.tone === 'ok' ? 'status' : 'alert'}>
          <Icon name={flash.tone === 'ok' ? 'check' : 'ban'} className="w-4 h-4 shrink-0" />
          <span className="flex-1">{flash.text}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label={t('Close')} className="w-6 h-6 rounded text-current opacity-60 hover:opacity-100 flex items-center justify-center"><Icon name="close" className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* The role cards are also the role filter: click one to see only that role, click it again for everyone. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {ROLES.map((role) => {
          const meta = ROLE_META[role];
          const on = roleFilter === role;
          return (
            <button
              key={role}
              type="button"
              aria-pressed={on}
              onClick={() => setRoleFilter(on ? null : role)}
              className={`text-left bg-white border rounded-xl p-4 transition focus:outline-none focus:ring-2 focus:ring-brand-500 ${on ? 'border-brand-500 ring-1 ring-brand-500' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.badge}`}>{t(meta.label)}</span>
                <span className="text-2xl font-bold text-gray-900 tabular-nums">{active.filter((c) => c.role === role).length}</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">{t(meta.description)}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="flex flex-wrap items-center gap-3 p-3 border-b border-gray-100">
          <label className="relative flex-1 min-w-[12rem]">
            <span className="sr-only">{t('Search by name or email')}</span>
            <Icon name="search" className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Search by name or email')}
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="group" aria-label={t('Status')}>
            {statusTabs.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={status === s.key}
                onClick={() => setStatus(s.key)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md ${status === s.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {s.label} <span className="text-gray-400 tabular-nums">{s.n}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-500 p-4" role="alert">{error.message}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">{t('Member')}</th>
                <th className="px-4 py-3 font-medium">{t('Role')}</th>
                <th className="px-4 py-3 font-medium">{t('Status')}</th>
                <th className="px-4 py-3 font-medium">{t('Joined')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((c) => {
                const meta = ROLE_META[c.role];
                const isSelf = c.id === me;
                const off = !!c.deactivatedAt;
                const busy = busyId === c.id;
                const name = fullName(c);
                const expired = c.inviteExpiresAt && new Date(c.inviteExpiresAt) < new Date();
                const prescriber = PRESCRIBING_ROLES.includes(c.role);
                return (
                  <tr key={c.id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3">
                      <div className={`flex items-center gap-3 ${off ? 'opacity-50' : ''}`}>
                        <div className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold uppercase ${off ? 'bg-gray-200 text-gray-500' : meta.avatar}`} aria-hidden="true">
                          {c.firstName[0]}{c.lastName[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {name}
                            {isSelf && <span className="ml-2 text-[11px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{t('You')}</span>}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{c.email}</p>
                          {(c.specialty || c.languages.length > 0) && <p className="text-xs text-gray-400 truncate">{[c.specialty, c.languages.join(', ')].filter(Boolean).join(' · ')}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.badge}`}>{t(meta.label)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[15rem]">
                        {off && <Chip icon="ban" cls="bg-gray-200 text-gray-700">{t('Deactivated')}</Chip>}
                        {!off && c.invitePending && <Chip icon="clock" cls={expired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}>{expired ? t('Invitation expired') : t('Invitation pending')}</Chip>}
                        {prescriber && (c.isVerified
                          ? <Chip icon="shield" cls="bg-green-50 text-green-700">{t('Verified')}</Chip>
                          : <Chip cls="bg-gray-100 text-gray-500">{t('Unverified')}</Chip>)}
                        {c.mfaEnabled && <Chip cls="bg-blue-50 text-blue-700">MFA</Chip>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{timeAgo(c.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {off ? (
                          <IconButton icon="restore" tone="green" label={t('Reactivate')} disabled={busy} onClick={() => run(c, () => reactivate({ variables: { id: c.id } }), t('{name} can sign in again.', { name }))} />
                        ) : (
                          <>
                            <IconButton icon="pencil" tone="brand" label={t('Edit')} onClick={() => setEditing({ id: c.id })} />
                            {prescriber && <IconButton icon="shield" tone={c.isVerified ? 'green' : 'neutral'} label={c.isVerified ? t('Medical licence') : t('Verify licence')} onClick={() => setEditing({ id: c.id, focus: 'licence' })} />}
                            {!isSelf && (
                              <IconButton
                                icon="envelope"
                                label={c.invitePending ? t('Resend invitation') : t('Send password link')}
                                disabled={busy}
                                onClick={async () => {
                                  setNotice(null);
                                  const r = await run(c, () => sendInvite({ variables: { id: c.id } }));
                                  if (r?.data) setNotice(r.data.sendClinicianInvite);
                                }}
                              />
                            )}
                            {!isSelf && <IconButton icon="ban" tone="red" label={t('Deactivate')} disabled={busy} onClick={() => setPending({ kind: 'deactivate', clinician: c })} />}
                          </>
                        )}
                        {!isSelf && c.invitePending && <IconButton icon="trash" tone="red" label={t('Delete')} disabled={busy} onClick={() => setPending({ kind: 'delete', clinician: c })} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-500">{filtered ? t('No members match.') : t('No team members yet.')}</p>
                    {filtered && (
                      <button type="button" onClick={() => { setQuery(''); setRoleFilter(null); setStatus('active'); }} className="mt-2 text-xs font-medium text-brand-500 hover:underline">{t('Clear filters')}</button>
                    )}
                  </td>
                </tr>
              )}
              {loading && !data && <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">{t('Loading…')}</td></tr>}
            </tbody>
          </table>
        </div>

        <p className="flex items-start gap-2 text-xs text-gray-500 px-4 py-3 border-t border-gray-100">
          <Icon name="shield" className="w-4 h-4 shrink-0" />
          {t('Doctors and admins can only prescribe after you have checked their medical licence and marked them verified.')}
        </p>
      </div>

      <div className="mt-8"><DoctorPerformance /></div>

      {adding && <AddMemberDialog onClose={() => setAdding(false)} onCreated={(r) => { setAdding(false); setNotice(r); }} />}
      {editingClinician && <EditMemberDialog clinician={editingClinician} isSelf={editingClinician.id === me} focus={editing?.focus} onClose={() => setEditing(null)} />}
      {pending?.kind === 'deactivate' && (
        <ConfirmDialog
          danger
          title={t('Deactivate member')}
          message={t('Deactivate {name}? They are signed out at once and cannot sign in until you reactivate them. Everything they did stays on record.', { name: fullName(pending.clinician) })}
          confirmLabel={t('Deactivate')}
          busy={deactivating.loading}
          onCancel={() => setPending(null)}
          onConfirm={() => run(pending.clinician, () => deactivate({ variables: { id: pending.clinician.id } }), t('{name} was deactivated.', { name: fullName(pending.clinician) }))}
        />
      )}
      {pending?.kind === 'delete' && (
        <ConfirmDialog
          danger
          title={t('Delete invitation')}
          message={t('Delete {name}? They have never signed in. This cannot be undone.', { name: fullName(pending.clinician) })}
          confirmLabel={t('Delete')}
          busy={deleting.loading}
          onCancel={() => setPending(null)}
          onConfirm={() => run(pending.clinician, () => deleteUnused({ variables: { id: pending.clinician.id } }), t('{name} was deleted.', { name: fullName(pending.clinician) }))}
        />
      )}
    </div>
  );
}
