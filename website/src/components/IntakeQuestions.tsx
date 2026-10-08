'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loadAssessment, mergeAssessment, type Assessment } from '@/lib/storage';
import type { ProductKind } from '@/lib/config';
import { track } from '@/lib/analytics';
import {
  clearDraft, fetchIntake, hasAnswer, isVisible, loadDraft, numberOk, saveDraft, saveIntake, toAnswer,
  type IntakeQuestion, type IntakeValues,
} from '@/lib/intake';

const ELIGIBILITY_URL: Record<ProductKind, string> = { HRT: '/hrt-eligibility', GLP1: '/glp1-eligibility', TRT: '/trt-eligibility' };

/** Where in the questions the visitor is: a question by its position among the visible ones, or the consent. */
type Pos = { stage: 'q' | 'consent'; idx: number };

/**
 * The medical questionnaire, one question at a time, asked after a treatment is chosen and before paying.
 * What is answered here becomes the doctor's consultation once the payment succeeds, so the patient is not
 * asked again after signing up. The browser's Back button steps back through the questions.
 */
export default function IntakeQuestions() {
  const router = useRouter();
  const [session, setSession] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<IntakeQuestion[]>([]);
  const [consent, setConsent] = useState<{ version: string; text: string } | null>(null);
  const [values, setValues] = useState<IntakeValues>({});
  const [pos, setPos] = useState<Pos>({ stage: 'q', idx: 0 });
  const [agreed, setAgreed] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'nosession' | 'failed'>('loading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const depth = useRef(0);

  const kind = session?.product as ProductKind | undefined;

  useEffect(() => {
    const s = loadAssessment();
    setSession(s);
    if (!s?.passed || !s.leadId || !s.email || !s.product || !s.plan) { setState('nosession'); return; }
    fetchIntake(s.product as ProductKind)
      .then(({ questions: qs, consent: c }) => {
        setQuestions(qs);
        setConsent(c);
        setValues(loadDraft(s.leadId!));
        setState('ready');
        setHydrated(true);
      })
      .catch(() => setState('failed'));
  }, []);

  useEffect(() => {
    if (hydrated && session?.leadId && Object.keys(values).length) saveDraft(session.leadId, values);
  }, [hydrated, session?.leadId, values]);

  const visible = useMemo(() => questions.filter((q) => isVisible(q, values)), [questions, values]);
  const n = visible.length;
  const q = pos.stage === 'q' ? visible[pos.idx] : undefined;

  // Back and Forward step through the questions: each new position is a history entry.
  useEffect(() => {
    if (!hydrated) return;
    const key = `${pos.stage}:${pos.idx}`;
    if (window.history.state?.thqi?.key === key) return;
    const first = window.history.state?.thqi === undefined;
    if (!first) depth.current += 1;
    const entry = { ...window.history.state, thqi: { key, ...pos, depth: depth.current } };
    if (first) window.history.replaceState(entry, '');
    else window.history.pushState(entry, '');
  }, [hydrated, pos]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const t = e.state?.thqi;
      if (!t) return;
      depth.current = t.depth;
      setPos({ stage: t.stage, idx: t.idx });
      setError('');
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const set = useCallback((id: string, v: string[]) => setValues((prev) => ({ ...prev, [id]: v })), []);

  const goNext = (from: number, vals: IntakeValues) => {
    const stillVisible = questions.filter((x) => isVisible(x, vals));
    setError('');
    setPos(from < stillVisible.length - 1 ? { stage: 'q', idx: from + 1 } : { stage: 'consent', idx: from + 1 });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const back = () => {
    if (depth.current > 0) { window.history.back(); return; }
    setPos((p) => (p.idx > 0 ? { stage: 'q', idx: p.idx - 1 } : p));
  };

  const toggle = (qq: IntakeQuestion, value: string) => {
    const current = values[qq.id] ?? [];
    const option = qq.options?.find((o) => o.value === value);
    if (current.includes(value)) return set(qq.id, current.filter((v) => v !== value));
    // An exclusive option ("None of these") clears the others, and the others clear it.
    if (option?.exclusive) return set(qq.id, [value]);
    const exclusive = new Set(qq.options?.filter((o) => o.exclusive).map((o) => o.value));
    set(qq.id, [...current.filter((v) => !exclusive.has(v)), value]);
  };

  const submit = async () => {
    if (!session?.leadId || !session.email || !consent || saving) return;
    setSaving(true);
    setError('');
    try {
      await saveIntake({
        leadId: session.leadId,
        email: session.email,
        answers: visible.filter((x) => hasAnswer(x, values)).map((x) => toAnswer(x, values[x.id])),
        telehealthConsentVersion: consent.version,
      });
      clearDraft(session.leadId);
      mergeAssessment({ intakeDone: true });
      track('intake_completed', { product: kind });
      router.push('/checkout?plan=' + encodeURIComponent(session.plan!));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'We couldn’t save your answers. Please check your connection and try again.');
      setSaving(false);
    }
  };

  if (state === 'loading') return <p className="thq-help" style={{ textAlign: 'center' }}>Loading…</p>;
  if (state === 'failed') return (
    <div className="th-co-nosession">
      <h2>We couldn’t load the questions</h2>
      <p>Please check your connection and try again.</p>
      <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Try again</button>
    </div>
  );
  if (state === 'nosession') return (
    <div className="th-co-nosession">
      <h2>Session not found</h2>
      <p>Please complete the eligibility assessment and choose a treatment first.</p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/hrt-eligibility" className="btn-secondary">HRT assessment</Link>
        <Link href="/glp1-eligibility" className="btn-primary">GLP-1 assessment</Link>
        <Link href="/trt-eligibility" className="btn-secondary">TRT assessment</Link>
      </div>
    </div>
  );

  const pct = (i: number) => `${Math.max(5, Math.round((i / (n + 1)) * 100))}%`;

  /* ── Consent ── */
  if (pos.stage === 'consent' || !q) {
    return (
      <div className="thq-in">
        <div className="thq-top">
          <button className="thq-arrow" onClick={back} aria-label="Back">←</button>
          <div className="thq-progress"><div className="thq-bar" style={{ width: '95%' }} /></div>
          <div className="thq-count">Last step</div>
        </div>
        <h2 className="thq-q">Before you pay</h2>
        <p className="thq-help">A doctor reads every answer before prescribing anything.</p>
        {consent && (
          <ul className="thq-consent-list">
            {consent.text.split('\n').filter(Boolean).map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
        <label className="thq-consent">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I understand and agree.</span>
        </label>
        {error && <div className="thq-error" role="alert">{error}</div>}
        <button type="button" className="thq-next" disabled={!agreed || saving} onClick={submit}>
          {saving ? 'Saving…' : 'Continue to payment'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--c-muted)' }}>
          <Link href={ELIGIBILITY_URL[kind ?? 'GLP1']} style={{ color: 'var(--c-blue)' }}>Change my earlier answers</Link>
        </p>
      </div>
    );
  }

  /* ── A question ── */
  const sel = values[q.id] ?? [];
  const canNext = q.type === 'number' ? numberOk(q, sel[0]) : q.optional || hasAnswer(q, values);

  return (
    <div className="thq-in">
      <div className="thq-top">
        <button className="thq-arrow" onClick={back} disabled={pos.idx === 0 && depth.current === 0} aria-label="Back">←</button>
        <div className="thq-progress"><div className="thq-bar" style={{ width: pct(pos.idx) }} /></div>
        <div className="thq-count">Question {pos.idx + 1} / {n}</div>
      </div>
      <h2 className="thq-q">{q.text}{q.optional && <span className="thq-optional"> (optional)</span>}</h2>
      {q.help ? <p className="thq-help">{q.help}</p> : q.type === 'multi' ? <p className="thq-help">Select all that apply.</p> : <div className="thq-spacer" />}

      {q.type === 'single' && (
        <div className="thq-opts" role="radiogroup" aria-label={q.text}>
          {q.options?.map((o) => (
            <button
              key={o.value}
              type="button"
              className="thq-opt"
              role="radio"
              aria-checked={sel[0] === o.value}
              onClick={() => {
                const next = { ...values, [q.id]: [o.value] };
                setValues(next);
                goNext(pos.idx, next);
              }}
            >
              <span className="thq-dot" />
              {o.label}
            </button>
          ))}
        </div>
      )}

      {q.type === 'multi' && (
        <div className="thq-opts" role="group" aria-label={q.text}>
          {q.options?.map((o) => {
            const on = sel.includes(o.value);
            return (
              <button key={o.value} type="button" className="thq-opt" role="checkbox" aria-checked={on} onClick={() => toggle(q, o.value)}>
                <span className="thq-box">{on ? '✓' : ''}</span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      {q.type === 'number' && (
        <div className="thq-numrow">
          <input
            className="thq-input"
            type="number"
            inputMode="decimal"
            step="any"
            min={q.min ?? undefined}
            max={q.max ?? undefined}
            value={sel[0] ?? ''}
            aria-label={q.text}
            onChange={(e) => set(q.id, [e.target.value])}
            onKeyDown={(e) => e.key === 'Enter' && canNext && goNext(pos.idx, values)}
          />
          {q.unit && <span className="thq-unit">{q.unit}</span>}
        </div>
      )}
      {q.type === 'number' && sel[0] && !canNext && (
        <div className="thq-error">Please enter a value between {q.min} and {q.max}{q.unit ? ` ${q.unit}` : ''}.</div>
      )}

      {q.type === 'text' && (
        <textarea className="thq-input" rows={3} maxLength={2000} value={sel[0] ?? ''} aria-label={q.text} onChange={(e) => set(q.id, [e.target.value])} />
      )}

      {q.type !== 'single' && (
        <button type="button" className="thq-next" disabled={!canNext} onClick={() => goNext(pos.idx, values)}>
          {q.optional && !hasAnswer(q, values) ? 'Skip' : 'Next'}
        </button>
      )}
    </div>
  );
}
