'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { CREATE_TICKET, GET_TICKETS } from '@/graphql/tickets';
import { GET_PATIENTS } from '@/graphql/patients';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { getCurrentRole } from '@/lib/role';
import { InlineError } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/consultation/Modal';
import { PRIORITY_LABEL, TYPE_LABEL, type TicketPriority, type TicketType } from './ticket-meta';

type PatientRow = { id: string; firstName: string; lastName: string; email: string };

export default function NewTicketDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const role = getCurrentRole();
  const types = (Object.keys(TYPE_LABEL) as TicketType[]).filter((ty) => role !== 'DOCTOR' || ty === 'CLINICAL');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TicketType>(types[0]);
  const [priority, setPriority] = useState<TicketPriority>('NORMAL');
  const [search, setSearch] = useState('');
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [error, setError] = useState<unknown>(null);

  const { data } = useQuery(GET_PATIENTS);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return ((data?.patients ?? []) as PatientRow[])
      .filter((p) => `${p.firstName} ${p.lastName} ${p.email}`.toLowerCase().includes(q))
      .slice(0, 5);
  }, [data, search]);

  const [create, { loading }] = useMutation(CREATE_TICKET, {
    refetchQueries: [{ query: GET_TICKETS }],
    onCompleted: (d) => onCreated(d.createTicket.id),
    onError: setError,
  });

  return (
    <Modal title={t('New ticket')} onClose={onClose}>
      <form
        className="p-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          create({ variables: { input: { subject: subject.trim(), description: description.trim() || undefined, type, priority, patientId: patient?.id } } });
        }}
      >
        <InlineError error={error} />
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">{t('What is it about?')}</span>
          <input required autoFocus value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={t('e.g. The app won’t let me upload my photos')} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">{t('Details')}</span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-gray-700 mb-1">{t('Type')}</span>
            <Select value={type} onChange={(v) => setType(v as TicketType)} ariaLabel={t('Type')} options={types.map((ty) => ({ value: ty, label: t(TYPE_LABEL[ty]) }))} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-700 mb-1">{t('Priority')}</span>
            <Select value={priority} onChange={(v) => setPriority(v as TicketPriority)} ariaLabel={t('Priority')} options={(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => ({ value: p, label: t(PRIORITY_LABEL[p]) }))} />
          </label>
        </div>
        <div>
          <span className="block text-xs font-medium text-gray-700 mb-1">{t('Patient (optional)')}</span>
          {patient ? (
            <div className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <span>{patient.firstName} {patient.lastName} <span className="text-gray-400">· {patient.email}</span></span>
              <button type="button" onClick={() => setPatient(null)} className="text-xs text-gray-500 hover:text-gray-800">{t('Change')}</button>
            </div>
          ) : (
            <>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search by name or email…')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              {matches.length > 0 && (
                <ul className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {matches.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => { setPatient(p); setSearch(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                        {p.firstName} {p.lastName} <span className="text-gray-400">· {p.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        {type === 'CLINICAL' && <p className="text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-2">{t('A doctor will answer this one. Don’t give the patient medical advice yourself.')}</p>}
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={loading || subject.trim().length < 3} className="bg-brand-500 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{loading ? t('Creating…') : t('Create ticket')}</button>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">{t('Cancel')}</button>
        </div>
      </form>
    </Modal>
  );
}
