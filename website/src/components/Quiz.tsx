'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { QUIZZES, type QuizQuestion } from '@/lib/quiz-data';
import { loadAssessment, mergeAssessment, saveAssessment } from '@/lib/storage';
import { CONFIG, type ProductKind } from '@/lib/config';
import { loadReferralCode } from '@/lib/referral';
import ProductPicker from './ProductPicker';

/* ── Types ── */
interface Answer { question: string; sel: string[] }
interface QuizState {
  idx: number;
  answers: Record<string, Answer>;
  bmiBand: string | null;
  view: 'q' | 'calc' | 'details';
}

type Screen = 'quiz' | 'plans' | 'ineligible';

/* ── GraphQL mutation ── */
const CREATE_LEAD = `mutation CreateLead($input: CreateLeadInput!) { createLead(input: $input) { id } }`;

async function createLead(
  product: ProductKind,
  visibleQs: QuizQuestion[],
  answers: Record<string, Answer>,
  data: { firstName: string; lastName: string; email: string },
): Promise<string | null> {
  const apiBase = CONFIG.API_BASE;
  if (!apiBase) return null;

  const quizAnswers = visibleQs
    .filter((q) => answers[q.id])
    .map((q) => ({ questionId: q.id, question: q.q, answer: answers[q.id].sel.join(', ') }));

  const stored = typeof window !== 'undefined'
    ? JSON.parse(sessionStorage.getItem('th_assessment') ?? 'null')
    : null;
  if (product === 'GLP1' && stored?.med && CONFIG.MEDICATIONS[stored.med]) {
    quizAnswers.push({
      questionId: 'preferred_medication',
      question: 'Preferred medicine (chosen on products page)',
      answer: CONFIG.MEDICATIONS[stored.med],
    });
  }

  try {
    const res = await fetch(`${apiBase}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: CREATE_LEAD,
        variables: {
          input: {
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            productKind: product,
            quizAnswers,
            referralCode: loadReferralCode(),
          },
        },
      }),
    });
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);
    const id = json.data?.createLead?.id;
    if (!id) throw new Error('No lead ID in response');
    return id as string;
  } catch (err) {
    console.error('[quiz] createLead failed:', err);
    return null;
  }
}

/* ── Ineligible component ── */
function Ineligible({
  reason,
  onBack,
  onRestart,
}: {
  reason: string;
  onBack: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="th-ineligible">
      <div className="th-ineligible-icon">✕</div>
      <h2 className="th-ineligible-h2">We're sorry</h2>
      <p className="th-ineligible-reason">{reason}</p>
      <div className="th-ineligible-actions">
        <button className="btn-secondary" onClick={onBack}>
          ← Change my answer
        </button>
        <a href="/#contact" className="btn-primary btn-sm">
          Talk to us
        </a>
      </div>
      <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--c-muted)' }}>
        <button
          onClick={onRestart}
          style={{ background: 'none', border: 'none', color: 'var(--c-blue)', cursor: 'pointer', fontSize: 13 }}
        >
          Restart from the beginning
        </button>
      </p>
    </div>
  );
}

/* ── Main Quiz component ── */
export default function Quiz({ product }: { product: ProductKind }) {
  const questions = QUIZZES[product];

  const [screen, setScreen] = useState<Screen>('quiz');
  const [ineligReason, setIneligReason] = useState('');
  const [dqIdx, setDqIdx] = useState(0);
  const [st, setSt] = useState<QuizState>({ idx: 0, answers: {}, bmiBand: null, view: 'q' });
  const [calcErr, setCalcErr] = useState('');
  const [detailsErr, setDetailsErr] = useState('');
  const [saving, setSaving] = useState(false);

  /* Refs for BMI calc inputs — avoids losing values on error re-render */
  const hInputRef = useRef<HTMLInputElement>(null);
  const wInputRef = useRef<HTMLInputElement>(null);

  /* Resume: if ?resume=1 and session is already passed for this product, go straight to plans */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('resume') !== '1') return;
    const s = loadAssessment();
    if (s?.passed && s.product === product) setScreen('plans');
  }, [product]);

  const visible = useCallback(
    () => questions.filter((q) => !q.showIf || q.showIf({ bmiBand: st.bmiBand })),
    [questions, st.bmiBand],
  );

  const goIneligible = (reason: string, idx: number) => {
    setIneligReason(reason);
    setDqIdx(idx);
    setScreen('ineligible');
  };

  /* Go back to the specific question that caused the DQ, clearing its answer */
  const backToDqQuestion = () => {
    setSt((s) => {
      const vq = questions.filter((qq) => !qq.showIf || qq.showIf({ bmiBand: s.bmiBand }));
      const dqQ = vq[dqIdx];
      const newAnswers = { ...s.answers };
      if (dqQ) delete newAnswers[dqQ.id];
      return { ...s, idx: dqIdx, view: 'q', answers: newAnswers };
    });
    setScreen('quiz');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* Restart: clear stored eligibility so an old "passed" session can't bypass checkout guard */
  const restart = () => {
    saveAssessment({ passed: false, plan: null, leadId: null });
    setSt({ idx: 0, answers: {}, bmiBand: null, view: 'q' });
    setScreen('quiz');
    setCalcErr('');
    setDetailsErr('');
  };

  /* ── Advance after answering ── */
  const advance = useCallback(
    (q: QuizQuestion, answers: Record<string, Answer>, bmiBand: string | null) => {
      const a = answers[q.id];
      if (!a) return;
      const vq = questions.filter((qq) => !qq.showIf || qq.showIf({ bmiBand }));
      const pos = vq.indexOf(q);
      for (const o of q.options) {
        if (o.dq && a.sel.includes(o.l)) {
          goIneligible(o.dq, pos);
          return;
        }
      }
      const next: QuizState =
        pos < vq.length - 1
          ? { idx: pos + 1, view: 'q', answers, bmiBand }
          : { idx: pos, view: 'details', answers, bmiBand };
      setSt(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions],
  );

  /* ── Pick an answer ── */
  const pick = (q: QuizQuestion, optIdx: number) => {
    const o = q.options[optIdx];

    if (q.type === 'single') {
      if (o.calc) { setSt((s) => ({ ...s, view: 'calc' })); return; }
      const newAnswers = { ...st.answers, [q.id]: { question: q.q, sel: [o.l] } };
      const newBmiBand = q.id === 'bmi' ? (o.band ?? null) : st.bmiBand;
      advance(q, newAnswers, newBmiBand);
      return;
    }

    // multi — just toggle selection, user clicks "Next" to advance
    setSt((s) => {
      const newAnswers = { ...s.answers };
      const cur = s.answers[q.id]?.sel.slice() ?? [];
      const at = cur.indexOf(o.l);
      let next: string[];
      if (at > -1) {
        next = cur.filter((_, i) => i !== at);
      } else if (o.x) {
        next = [o.l];
      } else {
        next = cur.filter((l) => !q.options.some((p) => p.l === l && p.x));
        next.push(o.l);
      }
      if (next.length) newAnswers[q.id] = { question: q.q, sel: next };
      else delete newAnswers[q.id];
      return { ...s, answers: newAnswers };
    });
  };

  /* ── Back ── */
  const back = () => {
    setSt((s) => {
      if (s.view === 'details') return { ...s, view: 'q', idx: visible().length - 1 };
      if (s.view === 'calc') return { ...s, view: 'q' };
      if (s.idx > 0) return { ...s, idx: s.idx - 1 };
      return s;
    });
    setCalcErr('');
  };

  /* ── BMI calc submit — reads from DOM refs to survive error re-renders ── */
  const doCalc = () => {
    const h = parseFloat(hInputRef.current?.value ?? '');
    const w = parseFloat(wInputRef.current?.value ?? '');
    if (!(h >= 120 && h <= 230) || !(w >= 35 && w <= 300)) {
      setCalcErr('Please enter a height between 120 and 230 cm and a weight between 35 and 300 kg.');
      return;
    }
    setCalcErr('');
    const bmi = Math.round((w / Math.pow(h / 100, 2)) * 10) / 10;
    const q = questions.find((qq) => qq.id === 'bmi')!;
    const ans = { ...st.answers, [q.id]: { question: q.q, sel: [`BMI ${bmi} (calculated from ${h} cm, ${w} kg)`] } };
    if (bmi < 27) {
      const bmiQ = questions.find((qq) => qq.id === 'bmi')!;
      const vq2 = questions.filter((qq) => !qq.showIf || qq.showIf({ bmiBand: null }));
      setSt((s) => ({ ...s, answers: ans, view: 'q' }));
      goIneligible(
        `Your BMI works out at ${bmi}. GLP-1 treatment is only prescribed for a BMI of 27 or above.`,
        vq2.indexOf(bmiQ),
      );
      return;
    }
    const band = bmi >= 30 ? '30+' : '27-29';
    advance(q, ans, band);
  };

  /* ── Details form submit — block on failed lead creation ── */
  const submitDetails = async (firstName: string, lastName: string, email: string) => {
    setSaving(true);
    const id = await createLead(product, visible(), st.answers, { firstName, lastName, email });
    if (!id) {
      // Without a saved lead the payment webhook can't create the patient's
      // account, so never let someone continue to pay from here.
      setDetailsErr("We couldn't save your details. Please check your connection and try again.");
      setSaving(false);
      return;
    }
    mergeAssessment({ product, passed: true, leadId: id, email, firstName, lastName, at: Date.now(), plan: null, method: null });
    setScreen('plans');
    setSaving(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── Render screens ── */
  if (screen === 'ineligible') return <Ineligible reason={ineligReason} onBack={backToDqQuestion} onRestart={restart} />;
  if (screen === 'plans') return <ProductPicker product={product} onRestart={restart} />;

  /* ── Quiz screens ── */
  const vq = visible();
  const n = vq.length;
  const q = vq[st.idx];
  const sel = st.answers[q?.id]?.sel ?? [];

  /* ── BMI Calculator ── */
  if (st.view === 'calc') {
    return (
      <div className="thq-in">
        <div className="thq-top">
          <button className="thq-arrow" onClick={back} aria-label="Back">←</button>
          <div className="thq-progress"><div className="thq-bar" style={{ width: `${Math.max(5, Math.round(st.idx / (n + 1) * 100))}%` }} /></div>
          <div className="thq-count">Question {st.idx + 1} / {n}</div>
        </div>
        <div className="thq-time">◷ Takes less than 2 minutes</div>
        <h2 className="thq-q">Let's work out your BMI</h2>
        <p className="thq-help">Enter your height and current weight.</p>
        <div className="thq-fields">
          <div className="thq-field">
            <label htmlFor="thq-h">Height (cm)</label>
            <input ref={hInputRef} id="thq-h" type="number" inputMode="decimal" min={120} max={230} placeholder="168" />
          </div>
          <div className="thq-field">
            <label htmlFor="thq-w">Weight (kg)</label>
            <input ref={wInputRef} id="thq-w" type="number" inputMode="decimal" min={35} max={300} placeholder="92" />
          </div>
        </div>
        {calcErr && <div className="thq-error">{calcErr}</div>}
        <button className="thq-next" onClick={doCalc}>
          Calculate my BMI
        </button>
      </div>
    );
  }

  /* ── Details form ── */
  if (st.view === 'details') {
    return (
      <div className="thq-in">
        <div className="thq-top">
          <button className="thq-arrow" onClick={back} aria-label="Back">←</button>
          <div className="thq-progress"><div className="thq-bar" style={{ width: '95%' }} /></div>
          <div className="thq-count">Last step</div>
        </div>
        <div className="thq-time">◷ Takes less than 2 minutes</div>
        <h2 className="thq-q">Where should we send your results?</h2>
        <p className="thq-help">Your doctor uses these details to review your assessment.</p>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const firstName = (fd.get('firstName') as string).trim();
            const lastName = (fd.get('lastName') as string).trim();
            const email = (fd.get('email') as string).trim();
            const consent = fd.get('consent');
            if (!firstName || !lastName) { setDetailsErr('Please enter your first and last name.'); return; }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setDetailsErr('Please enter a valid email address.'); return; }
            if (!consent) { setDetailsErr('Please tick the box to confirm and continue.'); return; }
            setDetailsErr('');
            await submitDetails(firstName, lastName, email);
          }}
        >
          <div className="thq-fields">
            <div className="thq-field">
              <label htmlFor="thq-fn">First name</label>
              <input id="thq-fn" name="firstName" type="text" autoComplete="given-name" />
            </div>
            <div className="thq-field">
              <label htmlFor="thq-ln">Last name</label>
              <input id="thq-ln" name="lastName" type="text" autoComplete="family-name" />
            </div>
            <div className="thq-field-full">
              <label htmlFor="thq-em">Email</label>
              <input id="thq-em" name="email" type="email" autoComplete="email" />
            </div>
          </div>
          <label className="thq-consent">
            <input type="checkbox" name="consent" />
            <span>I confirm my answers are accurate, and I consent to my health information being used to assess my eligibility.</span>
          </label>
          {detailsErr && <div className="thq-error">{detailsErr}</div>}
          <button type="submit" className="thq-next" disabled={saving}>
            {saving ? 'Saving…' : 'See my plans'}
          </button>
        </form>
      </div>
    );
  }

  /* ── Normal question ── */
  if (!q) return null;
  const multi = q.type === 'multi';

  return (
    <div className="thq-in">
      <div className="thq-top">
        <button className="thq-arrow" onClick={back} disabled={st.idx === 0} aria-label="Back">←</button>
        <div className="thq-progress">
          <div className="thq-bar" style={{ width: `${Math.max(5, Math.round(st.idx / (n + 1) * 100))}%` }} />
        </div>
        <div className="thq-count">Question {st.idx + 1} / {n}</div>
      </div>
      <div className="thq-time">◷ Takes less than 2 minutes</div>
      <h2 className="thq-q">{q.q}</h2>
      {q.help ? <p className="thq-help">{q.help}</p> : <div className="thq-spacer" />}

      <div className="thq-opts" role={multi ? 'group' : 'radiogroup'}>
        {q.options.map((o, i) => {
          const on = sel.includes(o.l);
          return (
            <button
              key={i}
              type="button"
              className="thq-opt"
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={on}
              onClick={() => pick(q, i)}
            >
              <span className={multi ? 'thq-box' : 'thq-dot'}>
                {on && multi ? '✓' : ''}
              </span>
              {o.l}
            </button>
          );
        })}
      </div>

      {multi && (
        <button
          className="thq-next"
          disabled={sel.length === 0}
          onClick={() => advance(q, st.answers, st.bmiBand)}
        >
          Next
        </button>
      )}
    </div>
  );
}
