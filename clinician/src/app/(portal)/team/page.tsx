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
} from '@/graphql/clinicians';

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

const ROLE_META: Record<string, { label: string; cls: string; description: string }> = {
  ADMIN:    { label: 'Admin',    cls: 'bg-purple-100 text-purple-700', description: 'Full access to all features' },
  DOCTOR:   { label: 'Doctor',   cls: 'bg-blue-100 text-blue-700',     description: 'Patients, review queue' },
  CX_TEAM:  { label: 'CX Team',  cls: 'bg-teal-100 text-teal-700',     description: 'Leads, patients, messaging' },
  PROVIDER: { label: 'Provider', cls: 'bg-amber-100 text-amber-700',   description: 'Orders only (pharmacy partner)' },
};

export default function TeamPage() {
  const { t, timeAgo } = useI18n();
  const { data, loading, error } = useQuery(GET_CLINICIANS);
  const [updateRole, { loading: saving, error: roleError }] = useMutation(UPDATE_CLINICIAN_ROLE, {
    refetchQueries: [{ query: GET_CLINICIANS }],
  });
  const [revoke] = useMutation(REVOKE_CLINICIAN_VERIFICATION);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  const clinicians = data?.clinicians ?? [];
  const byRole = ROLES.reduce((acc, r) => {
    acc[r] = clinicians.filter((c: any) => c.role === r);
    return acc;
  }, {} as Record<string, any[]>);

  const handleRoleChange = (id: string, role: string) => {
    updateRole({ variables: { id, role } });
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-gray-900">{t('Team & Roles')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('Manage clinician accounts and their access roles')}</p>
      </div>

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

      <p className="text-xs text-gray-500 mb-3">
        {t('Doctors and admins can only prescribe after you have checked their medical licence and marked them verified.')}
      </p>

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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clinicians.map((c: any) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                      {c.firstName[0]}{c.lastName[0]}
                    </div>
                    <span className="font-medium text-gray-900">{c.firstName} {c.lastName}</span>
                  </div>
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
                    disabled={saving}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
