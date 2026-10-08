'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { useI18n } from '@/lib/i18n/I18nProvider';
import DoctorPerformance from '@/components/insights/DoctorPerformance';
import {
  GET_CLINICIANS,
  UPDATE_CLINICIAN_ROLE,
  VERIFY_CLINICIAN,
  REVOKE_CLINICIAN_VERIFICATION,
  UPDATE_CLINICIAN_PROFILE,
  CREATE_CLINICIAN,
  UPDATE_CLINICIAN,
  DEACTIVATE_CLINICIAN,
  REACTIVATE_CLINICIAN,
  SEND_CLINICIAN_INVITE,
  DELETE_UNUSED_CLINICIAN,
} from '@/graphql/clinicians';
import { getCurrentUserId } from '@/lib/role';

// Only these roles can prescribe, so only they need a checked licence.
const PRESCRIBING_ROLES = ['ADMIN', 'DOCTOR'];

function VerifyForm({ clinician, onDone }: { clinician: any; onDone: () => void }) {
  const { t } = useI18n();
  const [licenseNumber, setLicenseNumber] = useState(clinician.licenseNumber ?? '');
  const [licensingBody, setLicensingBody] = useState(clinician.licensingBody ?? '');
  const [verify, { loading, error }] = useMutation(VERIFY_CLINICIAN, { onCompleted: onDone });

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        verify({ variables: { input: { clinicianId: clinician.id, licenseNumber, licensingBody } } });
      }}
    >
      <input
        value={licenseNumber}
        onChange={(e) => setLicenseNumber(e.target.value)}
        placeholder={t('Licence number')}
        required
        className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <input
        value={licensingBody}
        onChange={(e) => setLicensingBody(e.target.value)}
        placeholder={t('Licensing body')}
        required
        className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <button
        type="submit"
        disabled={loading}
        className="text-xs font-medium bg-brand-500 text-white px-2.5 py-1 rounded-lg disabled:opacity-50"
      >
        {loading ? t('Saving…') : t('Confirm verified')}
      </button>
      <button type="button" onClick={onDone} className="text-xs text-gray-500">{t('Cancel')}</button>
      {error && <p className="w-full text-xs text-red-500">{error.message}</p>}
    </form>
  );
}

/** What patients read about this clinician on their My Doctor page. */
function ProfileForm({ clinician, onDone }: { clinician: any; onDone: () => void }) {
  const { t } = useI18n();
  const [specialty, setSpecialty] = useState(clinician.specialty ?? '');
  const [bio, setBio] = useState(clinician.bio ?? '');
  const [languages, setLanguages] = useState((clinician.languages ?? []).join(', '));
  const [save, { loading, error }] = useMutation(UPDATE_CLINICIAN_PROFILE, { onCompleted: onDone });
  const field = 'border border-gray-200 rounded-lg px-2 py-1 text-xs w-full focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <form
      className="space-y-1.5 min-w-[16rem]"
      onSubmit={(e) => {
        e.preventDefault();
        save({ variables: { input: { clinicianId: clinician.id, specialty, bio, languages: languages.split(',') } } });
      }}
    >
      <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} maxLength={100} placeholder={t('Specialty, e.g. Endocrinologist')} className={field} />
      <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={3} placeholder={t('A line or two about their experience')} className={field} />
      <input value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder={t('Languages, separated by commas')} className={field} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={loading} className="text-xs font-medium bg-brand-500 text-white px-2.5 py-1 rounded-lg disabled:opacity-50">{loading ? t('Saving…') : t('Save')}</button>
        <button type="button" onClick={onDone} className="text-xs text-gray-500">{t('Cancel')}</button>
      </div>
      {error && <p className="text-xs text-red-500">{error.message}</p>}
    </form>
  );
}

const ROLES = ['ADMIN', 'DOCTOR', 'CX_TEAM', 'PROVIDER'] as const;

const inputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500';

const ROLE_META: Record<string, { label: string; cls: string; description: string }> = {
  ADMIN:    { label: 'Admin',    cls: 'bg-purple-100 text-purple-700', description: 'Full access to all features' },
  DOCTOR:   { label: 'Doctor',   cls: 'bg-blue-100 text-blue-700',     description: 'Patients, review queue' },
  CX_TEAM:  { label: 'CX Team',  cls: 'bg-teal-100 text-teal-700',     description: 'Leads, patients, messaging' },
  PROVIDER: { label: 'Provider', cls: 'bg-amber-100 text-amber-700',   description: 'Orders only (pharmacy partner)' },
};

type InviteResult = { emailSent: boolean; inviteUrl?: string | null; clinician: { firstName: string; lastName: string; email: string } };

/** Tells the admin what happened to the link: emailed, or (when it could not be) the link itself to pass on. */
function InviteNotice({ result, onClose }: { result: InviteResult; onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const name = `${result.clinician.firstName} ${result.clinician.lastName}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(result.inviteUrl ?? ''); setCopied(true); } catch { /* the link is shown, so it can be selected by hand */ }
  };
  return (
    <div className={`rounded-xl border p-4 mb-5 ${result.emailSent ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`} role="status">
      {result.emailSent ? (
        <p className="text-sm text-green-800">{t('We emailed {name} ({email}) a link to choose their password. It works once and lasts 7 days.', { name, email: result.clinician.email })}</p>
      ) : (
        <>
          <p className="text-sm font-medium text-amber-900">{t('The email could not be sent. Give {name} this link yourself: it works once and lasts 7 days.', { name })}</p>
          <div className="flex gap-2 mt-2">
            <input readOnly value={result.inviteUrl ?? ''} onFocus={(e) => e.currentTarget.select()} className={`${inputCls} font-mono text-xs`} aria-label={t('Invitation link')} />
            <button onClick={copy} className="shrink-0 text-xs font-medium bg-amber-600 text-white px-3 rounded-lg">{copied ? t('Copied') : t('Copy')}</button>
          </div>
          <p className="text-xs text-amber-800 mt-2">{t('Anyone with this link can set the password for this account, so send it only to them.')}</p>
        </>
      )}
      <button onClick={onClose} className="text-xs text-gray-500 mt-2 hover:underline">{t('Close')}</button>
    </div>
  );
}

/** Adds a member. They are never given a password: they choose their own from an emailed link. */
function AddMemberForm({ onCreated, onCancel }: { onCreated: (r: InviteResult) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: 'DOCTOR' });
  const [create, { loading, error }] = useMutation(CREATE_CLINICIAN, { refetchQueries: [{ query: GET_CLINICIANS }], onCompleted: (d) => onCreated(d.createClinician) });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form
      className="bg-white border border-gray-200 rounded-xl p-5 mb-5 space-y-3"
      onSubmit={(e) => { e.preventDefault(); create({ variables: { input: form } }).catch(() => undefined); }}
    >
      <h2 className="text-sm font-semibold text-gray-900">{t('Add a team member')}</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs text-gray-500">{t('First name')}<input required maxLength={60} value={form.firstName} onChange={set('firstName')} className={`${inputCls} mt-1`} autoComplete="off" /></label>
        <label className="text-xs text-gray-500">{t('Last name')}<input required maxLength={60} value={form.lastName} onChange={set('lastName')} className={`${inputCls} mt-1`} autoComplete="off" /></label>
        <label className="text-xs text-gray-500">{t('Email')}<input required type="email" maxLength={254} value={form.email} onChange={set('email')} className={`${inputCls} mt-1`} autoComplete="off" /></label>
        <label className="text-xs text-gray-500">{t('Role')}
          <select value={form.role} onChange={set('role')} className={`${inputCls} mt-1 bg-white`}>
            {ROLES.map((r) => <option key={r} value={r}>{t(ROLE_META[r].label)}</option>)}
          </select>
          <span className="block mt-1 text-gray-400">{t(ROLE_META[form.role].description)}</span>
        </label>
      </div>
      <p className="text-xs text-gray-400">{t('They will get an email with a link to choose their own password. You never see or set it.')}</p>
      {error && <p className="text-sm text-red-500" role="alert">{error.message}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="text-sm font-medium bg-brand-500 text-white px-4 py-2 rounded-lg disabled:opacity-50">{loading ? t('Adding…') : t('Add member and send link')}</button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 px-3">{t('Cancel')}</button>
      </div>
    </form>
  );
}

/** Name and email. The role and what patients see are changed elsewhere on the row. */
function DetailsForm({ clinician, onDone }: { clinician: any; onDone: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ firstName: clinician.firstName, lastName: clinician.lastName, email: clinician.email });
  const [save, { loading, error }] = useMutation(UPDATE_CLINICIAN, { refetchQueries: [{ query: GET_CLINICIANS }], onCompleted: onDone });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form
      className="mt-2 space-y-1.5 min-w-[16rem]"
      onSubmit={(e) => { e.preventDefault(); save({ variables: { input: { clinicianId: clinician.id, ...form } } }).catch(() => undefined); }}
    >
      <div className="flex gap-1.5">
        <input required maxLength={60} value={form.firstName} onChange={set('firstName')} aria-label={t('First name')} className={inputCls} />
        <input required maxLength={60} value={form.lastName} onChange={set('lastName')} aria-label={t('Last name')} className={inputCls} />
      </div>
      <input required type="email" maxLength={254} value={form.email} onChange={set('email')} aria-label={t('Email')} className={inputCls} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={loading} className="text-xs font-medium bg-brand-500 text-white px-2.5 py-1 rounded-lg disabled:opacity-50">{loading ? t('Saving…') : t('Save')}</button>
        <button type="button" onClick={onDone} className="text-xs text-gray-500">{t('Cancel')}</button>
      </div>
      {error && <p className="text-xs text-red-500" role="alert">{error.message}</p>}
    </form>
  );
}

export default function TeamPage() {
  const { t, timeAgo } = useI18n();
  const { data, loading, error } = useQuery(GET_CLINICIANS);
  const [updateRole, { loading: saving, error: roleError }] = useMutation(UPDATE_CLINICIAN_ROLE, {
    refetchQueries: [{ query: GET_CLINICIANS }],
  });
  const [revoke] = useMutation(REVOKE_CLINICIAN_VERIFICATION);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<InviteResult | null>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [actionError, setActionError] = useState('');
  const me = getCurrentUserId();

  const refetch = { refetchQueries: [{ query: GET_CLINICIANS }], onError: (e: Error) => setActionError(e.message) };
  const [deactivate] = useMutation(DEACTIVATE_CLINICIAN, refetch);
  const [reactivate] = useMutation(REACTIVATE_CLINICIAN, refetch);
  const [deleteUnused] = useMutation(DELETE_UNUSED_CLINICIAN, refetch);
  const [sendInvite] = useMutation(SEND_CLINICIAN_INVITE, { ...refetch, onCompleted: (d) => setNotice(d.sendClinicianInvite) });
  const run = (fn: () => Promise<unknown>) => { setActionError(''); fn().catch(() => undefined); };

  const everyone = data?.clinicians ?? [];
  const active = everyone.filter((c: any) => !c.deactivatedAt);
  const deactivatedCount = everyone.length - active.length;
  const clinicians = showDeactivated ? everyone : active;
  const byRole = ROLES.reduce((acc, r) => {
    acc[r] = active.filter((c: any) => c.role === r);
    return acc;
  }, {} as Record<string, any[]>);

  const handleRoleChange = (id: string, role: string) => {
    updateRole({ variables: { id, role } });
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('Team & Roles')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('Manage clinician accounts and their access roles')}</p>
        </div>
        <button onClick={() => { setAdding(true); setNotice(null); }} className="text-sm font-medium bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-900">{t('+ Add member')}</button>
      </div>

      {notice && <InviteNotice result={notice} onClose={() => setNotice(null)} />}
      {adding && <AddMemberForm onCreated={(r) => { setAdding(false); setNotice(r); }} onCancel={() => setAdding(false)} />}

      {/* Role overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {ROLES.map((role) => {
          const meta = ROLE_META[role];
          return (
            <div key={role} className="bg-white border border-gray-200 rounded-xl p-4">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.cls}`}>{t(meta.label)}</span>
              <p className="text-2xl font-bold text-gray-900 mt-2">{byRole[role]?.length ?? 0}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t(meta.description)}</p>
            </div>
          );
        })}
      </div>

      <DoctorPerformance />

      {loading && <p className="text-sm text-gray-400">{t('Loading…')}</p>}
      {error && <p className="text-sm text-red-500">{error.message}</p>}
      {roleError && <p className="text-sm text-red-500 mb-3">{roleError.message}</p>}
      {actionError && <p className="text-sm text-red-500 mb-3" role="alert">{actionError}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-xs text-gray-500">
          {t('Doctors and admins can only prescribe after you have checked their medical licence and marked them verified.')}
        </p>
        {deactivatedCount > 0 && (
          <button onClick={() => setShowDeactivated(!showDeactivated)} className="text-xs text-brand-500 hover:underline">
            {showDeactivated ? t('Hide deactivated ({n})', { n: deactivatedCount }) : t('Show deactivated ({n})', { n: deactivatedCount })}
          </button>
        )}
      </div>

      {/* Clinicians table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-5 py-3">{t('Name')}</th>
              <th className="px-5 py-3">{t('Email')}</th>
              <th className="px-5 py-3">{t('Licence')}</th>
              <th className="px-5 py-3">{t('Role')}</th>
              <th className="px-5 py-3">{t('Status')}</th>
              <th className="px-5 py-3">{t('Joined')}</th>
              <th className="px-5 py-3">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clinicians.map((c: any) => (
              <tr key={c.id} className={`hover:bg-gray-50 ${c.deactivatedAt ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                      {c.firstName[0]}{c.lastName[0]}
                    </div>
                    <span className="font-medium text-gray-900">{c.firstName} {c.lastName}</span>
                    {c.id === me && <span className="text-xs text-gray-400">({t('you')})</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.deactivatedAt && <span className="text-xs text-gray-600 bg-gray-200 px-2 py-0.5 rounded">{t('Deactivated')}</span>}
                    {!c.deactivatedAt && c.invitePending && (
                      <span className="text-xs text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                        {c.inviteExpiresAt && new Date(c.inviteExpiresAt) < new Date() ? t('Invitation expired') : t('Invitation pending')}
                      </span>
                    )}
                  </div>
                  {detailsId === c.id && <DetailsForm clinician={c} onDone={() => setDetailsId(null)} />}
                  {profileId === c.id ? (
                    <div className="mt-2"><ProfileForm clinician={c} onDone={() => setProfileId(null)} /></div>
                  ) : (
                    <div className="mt-1 text-xs text-gray-400 max-w-xs">
                      {(c.specialty || c.languages.length > 0) && <p>{[c.specialty, c.languages.join(', ')].filter(Boolean).join(' · ')}</p>}
                      <button onClick={() => setProfileId(c.id)} className="text-brand-500 hover:underline">{t('Edit what patients see')}</button>
                    </div>
                  )}
                </td>
                <td className="px-5 py-3 text-gray-500">{c.email}</td>
                <td className="px-5 py-3 text-gray-400">
                  {c.licenseNumber ? (
                    <>
                      <div className="text-gray-700">{c.licenseNumber}</div>
                      <div className="text-xs">{c.licensingBody}</div>
                    </>
                  ) : '—'}
                </td>
                <td className="px-5 py-3">
                  <select
                    value={c.role}
                    disabled={saving || c.id === me || !!c.deactivatedAt}
                    title={c.id === me ? t('You cannot change your own role') : undefined}
                    onChange={(e) => handleRoleChange(c.id, e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white disabled:opacity-50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{t(ROLE_META[r].label)}</option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-1.5">
                    {c.isVerified ? (
                      <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">{t('Verified')}</span>
                    ) : (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{t('Unverified')}</span>
                    )}
                    {c.mfaEnabled && (
                      <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded">MFA</span>
                    )}
                  </div>
                  {PRESCRIBING_ROLES.includes(c.role) && verifyingId !== c.id && (
                    <div className="mt-1.5">
                      {c.isVerified ? (
                        <button
                          onClick={() => {
                            if (confirm(t('Revoke {name}’s verification? They will no longer be able to prescribe.', { name: `${c.firstName} ${c.lastName}` }))) {
                              revoke({ variables: { id: c.id } });
                            }
                          }}
                          className="text-xs text-red-600 hover:underline"
                        >
                          {t('Revoke')}
                        </button>
                      ) : (
                        <button onClick={() => setVerifyingId(c.id)} className="text-xs text-brand-500 hover:underline">
                          {t('Verify licence')}
                        </button>
                      )}
                    </div>
                  )}
                  {verifyingId === c.id && (
                    <div className="mt-1.5">
                      <VerifyForm clinician={c} onDone={() => setVerifyingId(null)} />
                    </div>
                  )}
                </td>
                <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {timeAgo(c.createdAt)}
                </td>
                <td className="px-5 py-3">
                  {c.id === me ? (
                    <span className="text-xs text-gray-400">—</span>
                  ) : (
                    <div className="flex flex-col items-start gap-1 text-xs">
                      {!c.deactivatedAt && <button onClick={() => setDetailsId(detailsId === c.id ? null : c.id)} className="text-brand-500 hover:underline">{t('Edit details')}</button>}
                      {!c.deactivatedAt && (
                        <button onClick={() => run(() => sendInvite({ variables: { id: c.id } }))} className="text-brand-500 hover:underline">
                          {c.invitePending ? t('Resend invitation') : t('Send password link')}
                        </button>
                      )}
                      {c.deactivatedAt ? (
                        <button onClick={() => run(() => reactivate({ variables: { id: c.id } }))} className="text-green-700 hover:underline">{t('Reactivate')}</button>
                      ) : (
                        <button
                          onClick={() => confirm(t('Deactivate {name}? They are signed out at once and cannot sign in until you reactivate them. Everything they did stays on record.', { name: `${c.firstName} ${c.lastName}` })) && run(() => deactivate({ variables: { id: c.id } }))}
                          className="text-red-600 hover:underline"
                        >
                          {t('Deactivate')}
                        </button>
                      )}
                      {c.invitePending && (
                        <button
                          onClick={() => confirm(t('Delete {name}? They have never signed in. This cannot be undone.', { name: `${c.firstName} ${c.lastName}` })) && run(() => deleteUnused({ variables: { id: c.id } }))}
                          className="text-red-600 hover:underline"
                        >
                          {t('Delete')}
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
