'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { CREATE_PATIENT, GET_PATIENTS } from '@/graphql/patients';
import { GET_QUESTIONNAIRE } from '@/graphql/questionnaires';
import QuizQuestionsFields, { autofillAnswers, buildQuizAnswerInputs, QuizAnswers, Question } from './QuizQuestionsFields';
import { useI18n } from '@/lib/i18n/I18nProvider';

const FIRST_NAMES = ['Amelia', 'Noah', 'Olivia', 'Liam', 'Ava', 'Elijah', 'Sophia', 'Lucas', 'Mia', 'Mason'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor'];
const STREETS = ['High Street', 'Mill Lane', 'Church Road', 'Victoria Street', 'Kings Road'];
const CITIES = ['London', 'Manchester', 'Bristol', 'Leeds', 'Edinburgh'];

function randomOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function randomPassword(length = 12): string {
  let password = '';
  for (let i = 0; i < length; i++) password += PASSWORD_CHARS[Math.floor(Math.random() * PASSWORD_CHARS.length)];
  return password;
}

// A random adult DOB (22-51 years old) so the age check always passes.
function randomAdultDob(): string {
  const now = new Date();
  const age = 22 + Math.floor(Math.random() * 30);
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  return `${now.getFullYear() - age}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

type Plan = 'GLP1' | 'HRT' | 'TRT';

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  dateOfBirth: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  country: string;
  plan: Plan;
  onboardingCompleted: boolean;
};

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  dateOfBirth: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  postcode: '',
  country: '',
  plan: 'GLP1',
  onboardingCompleted: true,
};

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const labelCls = 'text-xs text-gray-400 mb-0.5 block';

export default function CreatePatientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (patientId: string) => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswers>({});
  const [priorMedicationUse, setPriorMedicationUse] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ id: string; email: string; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [createPatient, { loading }] = useMutation(CREATE_PATIENT, {
    refetchQueries: [{ query: GET_PATIENTS }],
  });
  const { data: questionnaireData } = useQuery(GET_QUESTIONNAIRE, {
    variables: { kind: form.plan, stage: 'INTAKE' },
  });
  const questions: Question[] = questionnaireData?.questionnaire?.questions ?? [];

  // The two plans ask different questions — answers from the other plan
  // don't carry over when the admin switches.
  useEffect(() => {
    setQuizAnswers({});
  }, [form.plan]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleAutofill = () => {
    const firstName = randomOf(FIRST_NAMES);
    const lastName = randomOf(LAST_NAMES);
    setForm((f) => ({
      ...f,
      firstName,
      lastName,
      email: `${firstName}.${lastName}+${Date.now()}@example.com`.toLowerCase(),
      password: randomPassword(),
      dateOfBirth: randomAdultDob(),
      phone: `07${Math.floor(100000000 + Math.random() * 900000000)}`,
      addressLine1: `${1 + Math.floor(Math.random() * 200)} ${randomOf(STREETS)}`,
      addressLine2: '',
      city: randomOf(CITIES),
      postcode: `SW1A ${Math.floor(Math.random() * 9)}AA`,
      country: 'United Kingdom',
    }));
    if (questions.length) setQuizAnswers(autofillAnswers(questions));
    setPriorMedicationUse(false);
  };

  const handleSubmit = async () => {
    setError('');
    try {
      const { data } = await createPatient({
        variables: {
          input: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim(),
            password: form.password.trim() || null,
            dateOfBirth: new Date(form.dateOfBirth),
            phone: form.phone.trim() || null,
            addressLine1: form.addressLine1.trim() || null,
            addressLine2: form.addressLine2.trim() || null,
            city: form.city.trim() || null,
            postcode: form.postcode.trim() || null,
            country: form.country.trim() || null,
            plan: form.plan,
            onboardingCompleted: form.onboardingCompleted,
            // Always sent: with onboarding left to the patient these still become their consultation, so it isn't asked again.
            quizAnswers: buildQuizAnswerInputs(questions, quizAnswers),
            priorMedicationUse,
          },
        },
      });
      if (data?.createPatient) {
        setCreated({
          id: data.createPatient.id,
          email: data.createPatient.email,
          temporaryPassword: data.createPatient.temporaryPassword,
        });
      }
    } catch (err: any) {
      setError(err.message ?? t('Failed to create patient'));
    }
  };

  const handleCopyPassword = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context) — the password is still shown on screen to copy manually.
    }
  };

  const canSubmit =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.trim() &&
    form.dateOfBirth &&
    (!form.password.trim() || form.password.trim().length >= 8);

  if (created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t('Patient created')}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{t('Share these details so they can sign in.')}</p>
            </div>
            <button onClick={onClose} aria-label={t('Close')} className="text-gray-400 hover:text-gray-600 text-sm -mt-0.5">✕</button>
          </div>

          <div className="px-6 pb-5 space-y-4">
            <dl className="rounded-xl border border-gray-200 divide-y divide-gray-100">
              <div className="px-4 py-3">
                <dt className="text-xs text-gray-400">{t('Email')}</dt>
                <dd className="text-sm text-gray-900 break-all mt-0.5">{created.email}</dd>
              </div>
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <dt className="text-xs text-gray-400">{t('Temporary password')}</dt>
                  <dd className="font-mono text-sm text-gray-900 break-all select-all mt-0.5">{created.temporaryPassword}</dd>
                </div>
                <button
                  onClick={handleCopyPassword}
                  className="shrink-0 text-xs font-medium text-brand-500 border border-brand-200 rounded-lg px-3 py-1.5 hover:bg-brand-50"
                >
                  {copied ? t('Copied') : t('Copy')}
                </button>
              </div>
            </dl>
            <p className="text-xs text-warn-900 bg-warn-50 rounded-lg px-3 py-2">
              {t('Shown once — it isn\'t saved anywhere. Copy it now if you need to log in as this patient.')}
            </p>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
            <button onClick={onClose} className="text-sm font-medium text-gray-600 border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50">
              {t('Close')}
            </button>
            <button onClick={() => onCreated(created.id)} className="text-sm font-medium bg-brand-500 text-white rounded-lg px-4 py-2 hover:bg-brand-700">
              {t('Go to patient')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{t('New patient')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex justify-end">
            <button
              onClick={handleAutofill}
              className="text-xs font-medium text-brand-500 border border-brand-200 rounded-lg px-3 py-1.5 hover:bg-brand-50"
            >
              {t('Autofill')}
            </button>
          </div>

          {/* 1. Plan + medical questionnaire — mirrors the quiz a patient answers before checkout */}
          <div>
            <p className={labelCls}>{t('Plan')}</p>
            <div className="flex gap-2">
              {(['GLP1', 'HRT', 'TRT'] as const).map((kind) => (
                <button
                  key={kind}
                  onClick={() => setForm((f) => ({ ...f, plan: kind }))}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium border ${
                    form.plan === kind ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {kind === 'GLP1' ? 'GLP-1' : kind === 'HRT' ? 'HRT' : 'TRT'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {questionnaireData?.questionnaire?.title ?? t('Medical questionnaire')}
            </p>
            {questions.length ? (
              <QuizQuestionsFields
                questions={questions}
                answers={quizAnswers}
                onChange={(id, value) => setQuizAnswers((a) => ({ ...a, [id]: value }))}
              />
            ) : (
              <p className="text-xs text-gray-400">{t('Loading questions…')}</p>
            )}
          </div>

          {/* 2. Personal info + address — mirrors checkout */}
          <div className="border-t border-gray-100 pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('First name')}</label>
                <input className={inputCls} value={form.firstName} onChange={set('firstName')} />
              </div>
              <div>
                <label className={labelCls}>{t('Last name')}</label>
                <input className={inputCls} value={form.lastName} onChange={set('lastName')} />
              </div>
            </div>

            <div>
              <label className={labelCls}>{t('Email')}</label>
              <input className={inputCls} type="email" name="new-patient-email" autoComplete="off" value={form.email} onChange={set('email')} />
            </div>

            <div>
              <label className={labelCls}>{t('Password')}</label>
              <div className="flex items-center gap-2">
                <input
                  className={`${inputCls} font-mono`}
                  type="text"
                  // A plain text field after an email one looks like a login form: stop the browser and password managers filling the admin's own email into it.
                  name="new-patient-password"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder={t('Leave blank to auto-generate')}
                  value={form.password}
                  onChange={set('password')}
                />
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, password: randomPassword() }))}
                  className="shrink-0 text-xs font-medium text-brand-500 border border-brand-200 rounded-lg px-3 py-1.5 hover:bg-brand-50"
                >
                  {t('Generate')}
                </button>
              </div>
              {form.password.trim() && form.password.trim().length < 8 && (
                <p className="text-xs text-red-600 mt-1">{t('Password must be at least 8 characters.')}</p>
              )}
            </div>

            <div>
              <label className={labelCls}>{t('Date of birth')}</label>
              <input className={inputCls} type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('Phone')}</label>
                <input className={inputCls} value={form.phone} onChange={set('phone')} />
              </div>
              <div>
                <label className={labelCls}>{t('Country')}</label>
                <input className={inputCls} value={form.country} onChange={set('country')} />
              </div>
            </div>

            <div>
              <label className={labelCls}>{t('Address line 1')}</label>
              <input className={inputCls} value={form.addressLine1} onChange={set('addressLine1')} />
            </div>
            <div>
              <label className={labelCls}>{t('Address line 2')}</label>
              <input className={inputCls} value={form.addressLine2} onChange={set('addressLine2')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('City')}</label>
                <input className={inputCls} value={form.city} onChange={set('city')} />
              </div>
              <div>
                <label className={labelCls}>{t('Postcode')}</label>
                <input className={inputCls} value={form.postcode} onChange={set('postcode')} />
              </div>
            </div>
          </div>

          {/* 3. Onboarding — mirrors what happens after checkout */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('Onboarding')}</p>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.onboardingCompleted}
                onChange={(e) => setForm((f) => ({ ...f, onboardingCompleted: e.target.checked }))}
                className="rounded border-gray-300"
              />
              {t('Mark onboarding as completed (identity verified, starter prescription issued)')}
            </label>

            {form.onboardingCompleted && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={priorMedicationUse}
                  onChange={(e) => setPriorMedicationUse(e.target.checked)}
                  className="rounded border-gray-300"
                />
                {t('Has used this treatment before (verified — affects GLP-1 starting-dose rules)')}
              </label>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5">{t('Cancel')}</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-brand-500 text-white disabled:opacity-40"
          >
            {loading ? t('Creating…') : t('Create patient')}
          </button>
        </div>
      </div>
    </div>
  );
}
