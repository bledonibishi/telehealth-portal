'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { REMOVE_SAVED_REPLY, SAVED_REPLIES, SAVE_SAVED_REPLY } from '@/graphql/tickets';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';
import { Modal } from '@/components/consultation/Modal';

type Reply = { id: string; title: string; body: string };

/** The team's ready-made answers: add, change or remove them. Where {name} is, the patient's first name goes when one is used. */
export default function SavedRepliesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { data } = useQuery(SAVED_REPLIES, { fetchPolicy: 'cache-and-network' });
  const replies: Reply[] = data?.savedReplies ?? [];
  const [editing, setEditing] = useState<Reply | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [save, { loading }] = useMutation(SAVE_SAVED_REPLY, { refetchQueries: [{ query: SAVED_REPLIES }], onError: setError, onCompleted: () => { setEditing(null); setError(null); } });
  const [remove] = useMutation(REMOVE_SAVED_REPLY, { refetchQueries: [{ query: SAVED_REPLIES }], onError: setError });

  const edit = (r: Reply | 'new') => { setEditing(r); setTitle(r === 'new' ? '' : r.title); setBody(r === 'new' ? '' : r.body); setError(null); };

  return (
    <Modal title={t('Saved replies')} subtitle={t('One-click answers for the team. {name} becomes the patient’s first name.')} onClose={onClose} wide>
      <div className="p-5 space-y-4">
        <InlineError error={error} />
        {editing ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save({ variables: { input: { id: editing === 'new' ? undefined : editing.id, title: title.trim(), body: body.trim() } } }); }}>
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">{t('Title')}</span>
              <input required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={t('e.g. Checking with the courier')} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">{t('The reply')}</span>
              <textarea required rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1500} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Hello {name}, …" />
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={loading} className="bg-brand-500 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{loading ? t('Saving…') : t('Save')}</button>
              <button type="button" onClick={() => setEditing(null)} className="text-sm text-gray-500 hover:text-gray-800">{t('Cancel')}</button>
            </div>
          </form>
        ) : (
          <>
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {replies.map((r) => (
                <li key={r.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{r.title}</p>
                    <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{r.body}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <button type="button" onClick={() => edit(r)} className="text-xs font-medium border border-gray-300 text-gray-700 bg-white rounded-lg px-2.5 py-1 hover:bg-gray-50">{t('Edit')}</button>
                    <button type="button" onClick={() => { if (window.confirm(t('Remove this saved reply?'))) remove({ variables: { id: r.id } }); }} className="text-xs font-medium border border-gray-300 text-red-600 bg-white rounded-lg px-2.5 py-1 hover:bg-red-50">{t('Remove')}</button>
                  </div>
                </li>
              ))}
              {replies.length === 0 && <li className="px-4 py-6 text-sm text-gray-400 text-center">{t('No saved replies yet.')}</li>}
            </ul>
            <button type="button" onClick={() => edit('new')} className="bg-brand-500 text-white rounded-lg px-4 py-2 text-sm font-medium">{t('New saved reply')}</button>
          </>
        )}
      </div>
    </Modal>
  );
}
