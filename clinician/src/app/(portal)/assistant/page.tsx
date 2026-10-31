'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { ASSISTANT_ARTICLE_GAPS, ASSISTANT_REVIEW, RATE_ASSISTANT_ANSWER, SAVE_SUPPORT_ARTICLE, SET_SUPPORT_ARTICLE_ACTIVE, SUPPORT_ARTICLES } from '@/graphql/assistant';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { Alert, ErrorAlert, InlineError } from '@/components/ui/Alert';
import { Modal } from '@/components/consultation/Modal';
import { LoadingState } from '@telehealth/loading';
import { systemText } from '@/lib/system-text';

type Tab = 'review' | 'articles';
type Article = { id: string; title: string; body: string; handoff: boolean; active: boolean; updatedAt: string };

const card = 'bg-white rounded-xl border border-gray-200';

function Stat({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: string }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold mt-0.5 ${tone ?? 'text-gray-900'}`}>{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

type Gap = { topic: string; suggestedTitle: string; count: number; examples: string[]; tickets: Array<{ id: string; number: number }> };

/** The questions no article covered, grouped by what they ask. Asked for on a click: grouping them is a call to the AI. */
function MissingArticles({ days }: { days: number }) {
  const { t } = useI18n();
  const [find, { data, loading, error, called }] = useLazyQuery(ASSISTANT_ARTICLE_GAPS, { fetchPolicy: 'network-only' });
  const g = data?.assistantArticleGaps;
  return (
    <section className={card}>
      <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">{t('Articles worth writing')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('The questions no article covered, grouped by what they ask. The biggest group is the article that would help most patients.')}</p>
        </div>
        <button type="button" disabled={loading} onClick={() => find({ variables: { days } })} className="text-xs font-medium border border-gray-300 text-gray-700 bg-white rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap">
          {loading ? t('Looking…') : called ? t('Look again') : t('Find what’s missing')}
        </button>
      </div>
      {error && <div className="p-5"><ErrorAlert error={error} /></div>}
      {g && !loading && (
        <>
          {!g.available && <div className="px-5 pt-4"><Alert tone="warning" title={t('The questions could not be grouped right now')}>{t('{n} questions had no article in this period. Try again in a few minutes.', { n: g.questions })}</Alert></div>}
          {g.available && g.groups.length === 0 && (
            <p className="p-6 text-sm text-gray-400">{g.questions === 0 ? t('Every question in this period had an article.') : t('{n} questions had no article, but none came up more than once.', { n: g.questions })}</p>
          )}
          {g.groups.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {g.groups.map((x: Gap) => (
                <li key={x.topic} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">{x.topic}</p>
                    <span className="text-xs font-medium text-amber-700 whitespace-nowrap">{t('{n} questions', { n: x.count })}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{t('Suggested article:')} <span className="font-medium">{x.suggestedTitle}</span></p>
                  <p className="text-xs text-gray-400 mt-1">{x.examples.join(' · ')}</p>
                  <p className="text-xs mt-1.5 flex flex-wrap gap-2">
                    {x.tickets.slice(0, 5).map((tk) => <Link key={tk.id} href={`/tickets/${tk.id}`} className="text-brand-500 hover:underline">#{tk.number}</Link>)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Review() {
  const { t, fmt, timeAgo } = useI18n();
  const [days, setDays] = useState(30);
  const { data, loading, error } = useQuery(ASSISTANT_REVIEW, { variables: { days }, fetchPolicy: 'cache-and-network' });
  const [problem, setProblem] = useState<unknown>(null);
  const [rate] = useMutation(RATE_ASSISTANT_ANSWER, { refetchQueries: [{ query: ASSISTANT_REVIEW, variables: { days } }], onError: setProblem });
  const r = data?.assistantReview;

  const rateIt = (id: string, rating: 'GOOD' | 'BAD') => {
    const note = rating === 'BAD' ? window.prompt(t('What was wrong with it? (optional)')) : null;
    if (rating === 'BAD' && note === null) return;
    rate({ variables: { messageId: id, rating, note: note || undefined } });
  };

  if (loading && !r) return <LoadingState />;
  if (error) return <ErrorAlert error={error} />;
  if (!r) return null;
  const rated = r.ratedGood + r.ratedBad;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} className={`px-3 py-1 rounded-full text-xs font-medium border ${days === d ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>{t('Last {n} days', { n: d })}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label={t('Answers given')} value={r.answers} hint={t('From a help article')} />
        <Stat label={t('Solved')} value={r.resolvedByAssistant} hint={t('The patient said it worked')} tone="text-green-700" />
        <Stat label={t('Handed to a person')} value={r.handedOver} hint={t('Health questions, no article, or not solved')} tone="text-amber-700" />
        <Stat label={t('Rated good')} value={r.ratedGood} tone="text-green-700" />
        <Stat label={t('Rated bad')} value={r.ratedBad} hint={rated ? t('{n}% of rated answers', { n: Math.round((r.ratedBad / rated) * 100) }) : undefined} tone={r.ratedBad ? 'text-red-600' : undefined} />
      </div>
      <InlineError error={problem} />

      <section className={card}>
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{t('Answers to rate')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('Each is what the assistant told a patient. A bad rating with a few words on what was wrong is how an article gets fixed.')}</p>
        </div>
        {r.recentAnswers.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">{t('No answers yet in this period.')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {r.recentAnswers.map((a: { id: string; content: string; sentAt: string; patientName: string; articleId: string; articleTitle: string; rating: string | null; ratingNote: string | null }) => (
              <li key={a.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-gray-500">{a.patientName} · {timeAgo(a.sentAt)} <span className="text-gray-300">·</span> {t('from')} <span className="font-medium text-gray-700">{a.articleTitle}</span></p>
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => rateIt(a.id, 'GOOD')} aria-pressed={a.rating === 'GOOD'} aria-label={t('Good answer')} className={`w-8 h-8 rounded-md border border-gray-200 hover:bg-gray-50 ${a.rating === 'GOOD' ? 'bg-green-100 border-green-200' : ''}`}>👍</button>
                    <button type="button" onClick={() => rateIt(a.id, 'BAD')} aria-pressed={a.rating === 'BAD'} aria-label={t('Bad answer')} className={`w-8 h-8 rounded-md border border-gray-200 hover:bg-gray-50 ${a.rating === 'BAD' ? 'bg-red-100 border-red-200' : ''}`}>👎</button>
                  </span>
                </div>
                <p className="text-sm text-gray-800 mt-1.5 whitespace-pre-wrap">{a.content}</p>
                {a.ratingNote && <p className="text-xs text-red-700 bg-red-50 rounded-md px-2.5 py-1.5 mt-2">{a.ratingNote}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{t('Handed to a person')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('The same question coming up again and again means an article is missing.')}</p>
        </div>
        {r.recentHandovers.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">{t('Nothing handed over in this period.')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {r.recentHandovers.map((h: { id: string; patientId: string; patientName: string; reason: string; at: string; ticketId: string | null; ticketNumber: number | null; ticketSubject: string | null }) => (
              <li key={h.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{systemText(h.reason, t) || t('A person took over')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{h.patientName} · {fmt(h.at, 'd MMM, HH:mm')}</p>
                </div>
                {h.ticketId && <Link href={`/tickets/${h.ticketId}`} className="text-xs font-medium text-brand-500 hover:underline whitespace-nowrap">#{h.ticketNumber} {h.ticketSubject}</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <MissingArticles days={days} />

      <section className={`${card} p-5`}>
        <h2 className="text-sm font-semibold text-gray-900">{t('Before changing the assistant')}</h2>
        <p className="text-sm text-gray-600 mt-1">{t('Whoever maintains the system runs the test questions first and after any change to the instructions, an article or the AI model:')}</p>
        <pre className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 overflow-x-auto">cd backend && pnpm support-bot-eval</pre>
        <p className="text-xs text-gray-500 mt-2">{t('Add a test question whenever the assistant gets something wrong, so it can never get it wrong that way again.')}</p>
        <p className="text-xs text-gray-500 mt-2">{t('The answers rated bad here, with the conversation that led to each, are listed by:')}</p>
        <pre className="mt-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 overflow-x-auto">cd backend && pnpm support-bot-bad-answers</pre>
      </section>
    </div>
  );
}

function Articles() {
  const { t, timeAgo } = useI18n();
  const { data, loading, error } = useQuery(SUPPORT_ARTICLES, { fetchPolicy: 'cache-and-network' });
  const [editing, setEditing] = useState<Article | 'new' | null>(null);
  const [problem, setProblem] = useState<unknown>(null);
  const [toggle] = useMutation(SET_SUPPORT_ARTICLE_ACTIVE, { refetchQueries: [{ query: SUPPORT_ARTICLES }], onError: setProblem });
  const articles: Article[] = data?.supportArticles ?? [];

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorAlert error={error} />;

  return (
    <div className="space-y-4">
      <Alert tone="warning" title={t('What you write here is what patients are told')}>
        {t('The assistant answers only from these articles. Say what the patient can do, step by step. Never put medical advice here, never promise that “we” will do something, and never ask for an email, password or card details. A question none of the articles covers goes to a person, which is what you want.')}
      </Alert>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{t('{n} articles', { n: articles.length })}</p>
        <button type="button" onClick={() => setEditing('new')} className="bg-brand-500 text-white rounded-lg px-4 py-2 text-sm font-medium">{t('New article')}</button>
      </div>
      <InlineError error={problem} />
      <ul className={`${card} divide-y divide-gray-100`}>
        {articles.map((a) => (
          <li key={a.id} className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <p className={`text-sm font-medium ${a.active ? 'text-gray-900' : 'text-gray-400'}`}>
                {a.title}
                {a.handoff && <span className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{t('Also goes to the team')}</span>}
                {!a.active && <span className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{t('Off')}</span>}
              </p>
              <p className={`text-sm mt-1 whitespace-pre-wrap ${a.active ? 'text-gray-600' : 'text-gray-400'}`}>{a.body}</p>
              <p className="text-xs text-gray-400 mt-1.5">{a.id} · {t('edited')} {timeAgo(a.updatedAt)}</p>
            </div>
            <div className="shrink-0 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setEditing(a)} className="text-xs font-medium border border-gray-300 text-gray-700 bg-white rounded-lg px-3 py-1.5 hover:bg-gray-50">{t('Edit')}</button>
              <button type="button" onClick={() => toggle({ variables: { id: a.id, active: !a.active } })} className="text-xs font-medium border border-gray-300 text-gray-700 bg-white rounded-lg px-3 py-1.5 hover:bg-gray-50">{a.active ? t('Switch off') : t('Switch on')}</button>
            </div>
          </li>
        ))}
      </ul>
      {editing && <ArticleDialog article={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ArticleDialog({ article, onClose }: { article: Article | null; onClose: () => void }) {
  const { t } = useI18n();
  const [id, setId] = useState(article?.id ?? '');
  const [title, setTitle] = useState(article?.title ?? '');
  const [body, setBody] = useState(article?.body ?? '');
  const [handoff, setHandoff] = useState(article?.handoff ?? false);
  const [error, setError] = useState<unknown>(null);
  const [save, { loading }] = useMutation(SAVE_SUPPORT_ARTICLE, { refetchQueries: [{ query: SUPPORT_ARTICLES }], onError: setError, onCompleted: onClose });
  return (
    <Modal title={article ? t('Edit article') : t('New article')} onClose={onClose} wide>
      <form className="p-5 space-y-3" onSubmit={(e) => { e.preventDefault(); save({ variables: { input: { id: id.trim(), title: title.trim(), body: body.trim(), handoff } } }); }}>
        <InlineError error={error} />
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">{t('The question it answers')}</span>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={t('e.g. How do I change my delivery address?')} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">{t('What the patient can do')}</span>
          <textarea required rows={6} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1200} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <span className="block text-xs text-gray-400 mt-1">{t('{n} of 1200 characters', { n: body.length })}</span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">{t('Short name')}</span>
          <input required disabled={!!article} value={id} onChange={(e) => setId(e.target.value.toLowerCase())} maxLength={40} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500" placeholder="delivery-address" />
          <span className="block text-xs text-gray-400 mt-1">{t('Lowercase letters, numbers and dashes. It cannot be changed later.')}</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={handoff} onChange={(e) => setHandoff(e.target.checked)} className="mt-1" />
          <span>{t('This answer is only a first step: the team must follow up')} <span className="block text-xs text-gray-400">{t('The patient gets the answer, and the conversation is also handed to the team.')}</span></span>
        </label>
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={loading} className="bg-brand-500 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{loading ? t('Saving…') : t('Save article')}</button>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">{t('Cancel')}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AssistantPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('review');
  const tabCls = (on: boolean) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px ${on ? 'border-brand-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`;
  return (
    <div>
      <div data-guide="page-header" className="px-4 sm:px-6 pt-5 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-semibold text-gray-900">{t('Assistant')}</h1>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">{t('The automated assistant that answers patients’ everyday questions: how it is doing, and what it is allowed to say')}</p>
        <div data-guide="assistant:tabs" className="flex gap-1">
          <button type="button" onClick={() => setTab('review')} className={tabCls(tab === 'review')}>{t('How it’s doing')}</button>
          <button type="button" onClick={() => setTab('articles')} className={tabCls(tab === 'articles')}>{t('Help articles')}</button>
        </div>
      </div>
      <div className="px-4 sm:px-6 py-5 max-w-5xl">{tab === 'review' ? <Review /> : <Articles />}</div>
    </div>
  );
}
