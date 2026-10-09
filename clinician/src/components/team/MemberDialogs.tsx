'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import {
  CREATE_CLINICIAN, GET_CLINICIANS, REVOKE_CLINICIAN_VERIFICATION, UPDATE_CLINICIAN, UPDATE_CLINICIAN_PROFILE, UPDATE_CLINICIAN_ROLE, VERIFY_CLINICIAN,
} from '@/graphql/clinicians';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { Icon } from './icons';
import { Modal } from './Modal';
import { PRESCRIBING_ROLES, ROLES, ROLE_META } from './roles';
import { InlineError } from '@/components/ui/Alert';

export type InviteResult = { emailSent: boolean; inviteUrl?: string | null; clinician: { firstName: string; lastName: string; email: string } };

const input = 'border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400';
const primary = 'text-sm font-medium bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-900 disabled:opacity-50';
const refetch = { refetchQueries: [{ query: GET_CLINICIANS }] };

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-xs font-medium text-gray-600">
      {label}
      <span className="block mt-1 font-normal">{children}</span>
      {hint && <span className="block mt-1 font-normal text-gray-400">{hint}</span>}
    </label>
  );
}

function RoleHint({ role }: { role: string }) {
  const { t } = useI18n();
  return <>{t(ROLE_META[role].description)}</>;
}

/** Adds a member. They are never given a password: they choose their own from an emailed link. */
export function AddMemberDialog({ onCreated, onClose }: { onCreated: (r: InviteResult) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: 'DOCTOR' });
  const [create, { loading, error }] = useMutation(CREATE_CLINICIAN, { ...refetch, onCompleted: (d) => onCreated(d.createClinician) });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title={t('Add a team member')} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); create({ variables: { input: form } }).catch(() => undefined); }} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t('First name')}><input required maxLength={60} value={form.firstName} onChange={set('firstName')} className={input} autoComplete="off" /></Field>
          <Field label={t('Last name')}><input required maxLength={60} value={form.lastName} onChange={set('lastName')} className={input} autoComplete="off" /></Field>
        </div>
        <Field label={t('Email')}><input required type="email" maxLength={254} value={form.email} onChange={set('email')} className={input} autoComplete="off" /></Field>
        <fieldset>
          <legend className="text-xs font-medium text-gray-600 mb-1.5">{t('Role')}</legend>
          <div className="grid sm:grid-cols-2 gap-2">
            {ROLES.map((r) => (
              <label key={r} className={`rounded-xl border p-3 cursor-pointer text-sm ${form.role === r ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="radio" name="role" value={r} checked={form.role === r} onChange={set('role')} className="sr-only" />
                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_META[r].badge}`}>{t(ROLE_META[r].label)}</span>
                <span className="block text-xs text-gray-500 mt-1.5"><RoleHint role={r} /></span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 flex gap-2"><Icon name="envelope" className="w-4 h-4 shrink-0 mt-px" />{t('They will get an email with a link to choose their own password. You never see or set it.')}</p>
        <InlineError error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-100">{t('Cancel')}</button>
          <button type="submit" disabled={loading} className={primary}>{loading ? t('Adding…') : t('Add member and send link')}</button>
        </div>
      </form>
    </Modal>
  );
}

/** One block of the edit dialog: a title, what it does, and its own save. */
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="py-4 first:pt-0 border-b border-gray-100 last:border-0 last:pb-0 scroll-mt-16">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Saved({ show }: { show: boolean }) {
  const { t } = useI18n();
  return show ? <span className="inline-flex items-center gap-1 text-xs text-green-700" role="status"><Icon name="check" className="w-3.5 h-3.5" />{t('Saved')}</span> : null;
}

function DetailsSection({ c }: { c: any }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ firstName: c.firstName, lastName: c.lastName, email: c.email });
  const [saved, setSaved] = useState(false);
  const [save, { loading, error }] = useMutation(UPDATE_CLINICIAN, { ...refetch, onCompleted: () => setSaved(true) });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => { setSaved(false); setForm({ ...form, [k]: e.target.value }); };
  return (
    <form onSubmit={(e) => { e.preventDefault(); save({ variables: { input: { clinicianId: c.id, ...form } } }).catch(() => undefined); }} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={t('First name')}><input required maxLength={60} value={form.firstName} onChange={set('firstName')} className={input} /></Field>
        <Field label={t('Last name')}><input required maxLength={60} value={form.lastName} onChange={set('lastName')} className={input} /></Field>
      </div>
      <Field label={t('Email')}><input required type="email" maxLength={254} value={form.email} onChange={set('email')} className={input} /></Field>
      <InlineError error={error} />
      <div className="flex items-center gap-3"><button type="submit" disabled={loading} className={primary}>{loading ? t('Saving…') : t('Save details')}</button><Saved show={saved} /></div>
    </form>
  );
}

function RoleSection({ c, isSelf }: { c: any; isSelf: boolean }) {
  const { t } = useI18n();
  const [role, setRole] = useState(c.role);
  const [saved, setSaved] = useState(false);
  const [save, { loading, error }] = useMutation(UPDATE_CLINICIAN_ROLE, { ...refetch, onCompleted: () => setSaved(true) });
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-2">
        {ROLES.map((r) => (
          <label key={r} className={`rounded-xl border p-3 text-sm ${isSelf ? 'opacity-60' : 'cursor-pointer'} ${role === r ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-gray-200 hover:bg-gray-50'}`}>
            <input type="radio" name={`role-${c.id}`} value={r} checked={role === r} disabled={isSelf} onChange={() => { setSaved(false); setRole(r); }} className="sr-only" />
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_META[r].badge}`}>{t(ROLE_META[r].label)}</span>
            <span className="block text-xs text-gray-500 mt-1.5"><RoleHint role={r} /></span>
          </label>
        ))}
      </div>
      {isSelf && <p className="text-xs text-gray-500">{t('You cannot change your own role')}</p>}
      <InlineError error={error} />
      <div className="flex items-center gap-3">
        <button type="button" disabled={loading || isSelf || role === c.role} onClick={() => save({ variables: { id: c.id, role } }).catch(() => undefined)} className={primary}>{loading ? t('Saving…') : t('Save role')}</button>
        <Saved show={saved} />
      </div>
    </div>
  );
}

function LicenceSection({ c }: { c: any }) {
  const { t, timeAgo } = useI18n();
  const [form, setForm] = useState({ licenseNumber: c.licenseNumber ?? '', licensingBody: c.licensingBody ?? '' });
  const [verify, v] = useMutation(VERIFY_CLINICIAN, refetch);
  const [revoke, r] = useMutation(REVOKE_CLINICIAN_VERIFICATION, refetch);
  const error = v.error ?? r.error;
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">{t('Doctors and admins can only prescribe after you have checked their medical licence and marked them verified.')}</p>
      {c.isVerified ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-green-50 border border-green-100 px-4 py-3">
          <div className="text-sm text-green-800">
            <p className="font-medium flex items-center gap-1.5"><Icon name="shield" className="w-4 h-4" />{t('Verified')} · {c.licenseNumber}</p>
            <p className="text-xs text-green-700/80 mt-0.5">{c.licensingBody}{c.verifiedAt ? ` · ${timeAgo(c.verifiedAt)}` : ''}</p>
          </div>
          <button type="button" disabled={r.loading} onClick={() => revoke({ variables: { id: c.id } }).catch(() => undefined)} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">{t('Revoke verification')}</button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); verify({ variables: { input: { clinicianId: c.id, ...form } } }).catch(() => undefined); }} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={t('Licence number')}><input required value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} className={input} /></Field>
            <Field label={t('Licensing body')}><input required value={form.licensingBody} onChange={(e) => setForm({ ...form, licensingBody: e.target.value })} className={input} /></Field>
          </div>
          <button type="submit" disabled={v.loading} className={primary}>{v.loading ? t('Saving…') : t('Confirm verified')}</button>
        </form>
      )}
      <InlineError error={error} />
    </div>
  );
}

function ProfileSection({ c }: { c: any }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ specialty: c.specialty ?? '', bio: c.bio ?? '', languages: (c.languages ?? []).join(', ') });
  const [saved, setSaved] = useState(false);
  const [save, { loading, error }] = useMutation(UPDATE_CLINICIAN_PROFILE, { ...refetch, onCompleted: () => setSaved(true) });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setSaved(false); setForm({ ...form, [k]: e.target.value }); };
  return (
    <form onSubmit={(e) => { e.preventDefault(); save({ variables: { input: { clinicianId: c.id, specialty: form.specialty, bio: form.bio, languages: form.languages.split(',') } } }).catch(() => undefined); }} className="space-y-3">
      <p className="text-xs text-gray-500">{t('This is what patients read about this person on their My Doctor page.')}</p>
      <Field label={t('Specialty')}><input value={form.specialty} maxLength={100} onChange={set('specialty')} placeholder={t('Specialty, e.g. Endocrinologist')} className={input} /></Field>
      <Field label={t('About')}><textarea value={form.bio} maxLength={500} rows={3} onChange={set('bio')} placeholder={t('A line or two about their experience')} className={input} /></Field>
      <Field label={t('Languages')}><input value={form.languages} onChange={set('languages')} placeholder={t('Languages, separated by commas')} className={input} /></Field>
      <InlineError error={error} />
      <div className="flex items-center gap-3"><button type="submit" disabled={loading} className={primary}>{loading ? t('Saving…') : t('Save')}</button><Saved show={saved} /></div>
    </form>
  );
}

/** Everything about one member in one place: details, role, licence and what patients see. Each part saves on its own. */
export function EditMemberDialog({ clinician, isSelf, focus, onClose }: { clinician: any; isSelf: boolean; focus?: 'licence'; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={`${clinician.firstName} ${clinician.lastName}`} onClose={onClose} wide>
      <Section id="details" title={t('Details')}><DetailsSection c={clinician} /></Section>
      <Section id="role" title={t('Role')}><RoleSection c={clinician} isSelf={isSelf} /></Section>
      {PRESCRIBING_ROLES.includes(clinician.role) && <Section id="licence" title={t('Medical licence')}><LicenceSection c={clinician} /></Section>}
      <Section id="profile" title={t('What patients see')}><ProfileSection c={clinician} /></Section>
      {focus === 'licence' && <ScrollTo id="licence" />}
    </Modal>
  );
}

function ScrollTo({ id }: { id: string }) {
  // Opens the dialog already scrolled to the licence, when the shield icon was what was clicked.
  return <span ref={(el) => { if (el) document.getElementById(id)?.scrollIntoView({ block: 'start' }); }} />;
}
