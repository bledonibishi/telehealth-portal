'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { QUIZZES, type QuizQuestion } from '@/lib/quiz-data';
import { loadAssessment, mergeAssessment, saveAssessment } from '@/lib/storage';
import { CONFIG, type ProductKind } from '@/lib/config';
import { loadReferralCode } from '@/lib/referral';
import { clearProgress, loadProgress, saveProgress } from '@/lib/quiz-progress';
import { track } from '@/lib/analytics';
import { fetchIntake, hasAnswer, isVisible, prefillFromBmi, toAnswer, type IntakeQuestion, type IntakeValues } from '@/lib/intake';
import { requestEmailCode, verifyEmailCode } from '@/lib/email-verification';
import ProductPicker from './ProductPicker';
import IntakeQuestionView from './IntakeQuestionView';

/* ── Types ── */
interface Answer { question: string; sel: string[] }
interface QuizState {
  idx: number;
  answers: Record<string, Answer>;
  bmiBand: string | null;
  view: 'q' | 'intake' | 'details';
  /** Answers to the medical questions after the eligibility ones, by question id. */
  health: IntakeValues;
  /** Whether the visitor has agreed to the statement shown before the first question. */
  agreed: boolean;
}

type Screen = 'quiz' | 'plans' | 'ineligible';
const INITIAL: QuizState = { idx: 0, answers: {}, bmiBand: null, view: 'q', health: {}, agreed: false };

/* ── GraphQL mutation ── */
const CREATE_LEAD = `mutation CreateLead($input: CreateLeadInput!) { createLead(input: $input) { id riskTag riskReasons } }`;

/** What the server made of the answers: RED may not go on to plans or payment. */
interface LeadResult { id: string; riskTag: 'RED' | 'ORANGE' | 'GREEN'; riskReasons: string[] }

async function createLead(
  product: ProductKind,
  visibleQs: QuizQuestion[],
  answers: Record<string, Answer>,
  data: { firstName: string; lastName: string; email: string },
  health: { answers: ReturnType<typeof toAnswer>[]; consentVersion: string },
  emailVerificationToken: string,
): Promise<LeadResult | 'EMAIL_TAKEN' | { error: string } | null> {
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
            emailVerificationToken,
            intakeAnswers: health.answers,
            telehealthConsentVersion: health.consentVersion,
            referralCode: loadReferralCode(),
          },
        },
      }),
    });
    const json = await res.json();
    // The server refuses an email that already has an account (HTTP 409 inside the GraphQL error).
    if ((json.errors?.[0]?.extensions?.originalError?.statusCode ?? json.errors?.[0]?.extensions?.status) === 409) return 'EMAIL_TAKEN';
    // The server checked the health answers or the consent and found something to put right: say what.
    if ((json.errors?.[0]?.extensions?.originalError?.statusCode ?? json.errors?.[0]?.extensions?.status) === 400 && json.errors[0].message) return { error: json.errors[0].message };
    if (json.errors?.length) throw new Error(json.errors[0].message);
    const lead = json.data?.createLead;
    if (!lead?.id) throw new Error('No lead ID in response');
    return lead as LeadResult;
  } catch (err) {
    console.error('[quiz] createLead failed:', err);
    return null;
  }
}

/* ── Ineligible component ── */
function Ineligible({
  reason,
  reasons,
  onBack,
  onRestart,
}: {
  reason: string;
  /** Why the server ruled the answers out, when it did. */
  reasons?: string[];
  /** Back to the question that ruled the visitor out; absent when no single question did. */
  onBack?: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="th-ineligible">
      <div className="th-ineligible-icon">✕</div>
      <h2 className="th-ineligible-h2">We're sorry</h2>
      <p className="th-ineligible-reason">{reason}</p>
      {reasons && reasons.length > 0 && (
        <ul className="th-ineligible-list">
          {reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      <p className="th-ineligible-note">
        Some treatments aren't safe for everyone, and we only prescribe when a doctor can be confident they are.
        This isn't a judgement on you. Please speak to your own doctor or pharmacist, who can examine you and
        review your full history. If any of your answers were a mistake, you can retake the assessment.
      </p>
      <div className="th-ineligible-actions">
        {onBack && (
          <button className="btn-secondary" onClick={onBack}>
            ← Change my answer
          </button>
        )}
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
  const [ineligReasons, setIneligReasons] = useState<string[]>([]);
  const [dqIdx, setDqIdx] = useState(0);
  const [st, setSt] = useState<QuizState>(INITIAL);
  // Whether a saved place was put back, and whether the saved copy has been read yet.
  const [restored, setRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [calcErr, setCalcErr] = useState('');
  const [detailsErr, setDetailsErr] = useState('');
  const [emailTaken, setEmailTaken] = useState(false);
  const [saving, setSaving] = useState(false);
  // The medical questions and the consent wording come from the server (the same ones the doctor's review rests on).
  const [intake, setIntake] = useState<{ questions: IntakeQuestion[]; consent: { version: string; text: string } } | null>(null);
  const [intakeFailed, setIntakeFailed] = useState(false);
  const [agreed, setAgreed] = useState(false);
  // The details step: name and email first, then the code emailed to that address, then the quiz is saved.
  const [contact, setContact] = useState<{ firstName: string; lastName: string; email: string } | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // The proof for the address that entered the code, kept while this page is open so a retry doesn't ask again.
  const [proof, setProof] = useState<{ email: string; token: string } | null>(null);
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= resendAt) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [resendAt]);

  const loadIntake = useCallback(() => {
    setIntakeFailed(false);
    fetchIntake(product).then(setIntake).catch(() => setIntakeFailed(true));
  }, [product]);
  useEffect(() => { loadIntake(); }, [loadIntake]);

  // Height and weight the BMI calculator already worked out are not asked again.
  const prefilled = prefillFromBmi(st.answers.bmi?.sel[0]);
  const health: IntakeValues = { ...st.health, ...prefilled };
  const healthQs = (intake?.questions ?? []).filter((x) => isVisible(x, health) && !(x.id in prefilled));

  // On arrival, pick up where this visitor left off (a refresh, or coming back later).
  useEffect(() => {
    const saved = loadProgress(product, questions);
    if (saved) {
      setSt(saved);
      setRestored(true);
    }
    setHydrated(true);
  }, [product, questions]);

  // Keep the saved copy in step with every answer, as it is given.
  useEffect(() => {
    if (hydrated && screen === 'quiz' && Object.keys(st.answers).length) saveProgress(product, st);
  }, [st, hydrated, screen, product]);

  // The browser's Back/Forward buttons step through the questions instead of leaving the quiz: each
  // new position is pushed as a history entry, and going back to an entry puts that position back.
  // `depth` counts the entries this quiz has pushed, so the on-screen arrow knows when to use history.
  const depth = useRef(0);
  useEffect(() => {
    if (!hydrated || screen === 'plans') return;
    const key = screen === 'quiz' ? `quiz:${st.view}:${st.idx}` : screen;
    if (window.history.state?.thq?.key === key) return;
    const first = window.history.state?.thq === undefined;
    if (!first) depth.current += 1;
    const entry = { ...window.history.state, thq: { key, screen, view: st.view, idx: st.idx, depth: depth.current } };
    if (first) window.history.replaceState(entry, '');
    else window.history.pushState(entry, '');
  }, [hydrated, screen, st.view, st.idx]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const t = e.state?.thq;
      if (!t) return;
      depth.current = t.depth;
      if (t.screen === 'quiz') {
        setSt((s) => ({ ...s, view: t.view, idx: t.idx }));
        setScreen('quiz');
      } else {
        setScreen(t.screen);
      }
      setCalcErr('');
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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

  const goIneligible = (reason: string, idx: number | null, reasons: string[] = []) => {
    setIneligReason(reason);
    setIneligReasons(reasons);
    setDqIdx(idx ?? -1);
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
    clearProgress(product);
    setRestored(false);
    setAgreed(false);
    saveAssessment({ passed: false, plan: null, leadId: null });
    setSt(INITIAL);
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
      // Health answers already given are kept if the visitor went back to change an earlier answer.
      const next: Omit<QuizState, 'health' | 'agreed'> =
        pos < vq.length - 1
          ? { idx: pos + 1, view: 'q', answers, bmiBand }
          : { idx: 0, view: 'intake', answers, bmiBand };
      setSt((s) => ({ ...s, ...next }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions],
  );

  /* ── Pick an answer ── */
  const pick = (q: QuizQuestion, optIdx: number) => {
    const o = q.options[optIdx];
    if (Object.keys(st.answers).length === 0) track('quiz_started', { product });
    setRestored(false);

    if (q.type === 'single') {
      const newAnswers = { ...st.answers, [q.id]: { question: q.q, sel: [o.l] } };
      advance(q, newAnswers, st.bmiBand);
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
    if (depth.current > 0) { window.history.back(); return; }
    setSt((s) => {
      if (s.view === 'details') return healthQs.length ? { ...s, view: 'intake', idx: healthQs.length - 1 } : { ...s, view: 'q', idx: visible().length - 1 };
      if (s.view === 'intake') return s.idx > 0 ? { ...s, idx: s.idx - 1 } : { ...s, view: 'q', idx: visible().length - 1 };
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
  const submitDetails = async (firstName: string, lastName: string, email: string, token: string) => {
    if (!intake) { setDetailsErr('The health questions haven’t loaded yet. Please try again in a moment.'); return; }
    setSaving(true);
    const lead = await createLead(
      product, visible(), st.answers, { firstName, lastName, email },
      { answers: healthQs.concat((intake.questions).filter((x) => x.id in prefilled)).filter((x) => hasAnswer(x, health)).map((x) => toAnswer(x, health[x.id])), consentVersion: intake.consent.version },
      token,
    );
    if (lead && typeof lead === 'object' && 'error' in lead) {
      // The proof ran out (or was never right): back to asking for a code.
      if (/verify your email/i.test(lead.error)) { setProof(null); setCode(''); setCodeSent(false); }
      setDetailsErr(lead.error);
      setSaving(false);
      return;
    }
    if (lead === 'EMAIL_TAKEN') {
      setEmailTaken(true);
      setDetailsErr('');
      setSaving(false);
      return;
    }
    if (!lead) {
      // Without a saved lead the payment webhook can't create the patient's
      // account, so never let someone continue to pay from here.
      setDetailsErr("We couldn't save your details. Please check your connection and try again.");
      setSaving(false);
      return;
    }
    // The server has the final say on eligibility: a RED answer set never reaches plans or payment.
    if (lead.riskTag === 'RED') {
      clearProgress(product);
      setSaving(false);
      goIneligible("Based on your answers, we can't prescribe this treatment online.", null, lead.riskReasons);
      return;
    }
    clearProgress(product);
    const id = lead.id;
    // The health answers went with the quiz, so checkout has everything it needs.
    mergeAssessment({ product, passed: true, leadId: id, email, firstName, lastName, at: Date.now(), plan: null, method: null, intakeDone: true });
    setScreen('plans');
    setSaving(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── Render screens ── */
  if (screen === 'ineligible') return <Ineligible reason={ineligReason} reasons={ineligReasons} onBack={dqIdx >= 0 ? backToDqQuestion : undefined} onRestart={restart} />;
  if (screen === 'plans') return <ProductPicker product={product} onRestart={restart} />;

  /* ── The statement, before the first question ── */
  if (!st.agreed) {
    return (
      <div className="thq-in">
        <h2 className="thq-q">Before you start</h2>
        <p className="thq-help">Please read how your online consultation works. A doctor reads every answer before prescribing anything.</p>
        {intake && (
          <ul className="thq-consent-list">
            {intake.consent.text.split('\n').filter(Boolean).map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
        {!intake && !intakeFailed && <p className="thq-help">Loading…</p>}
        {intakeFailed && (
          <div className="thq-error" role="alert">
            We couldn’t load this just now. <button type="button" onClick={loadIntake} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Try again</button>
          </div>
        )}
        <label className="thq-consent">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I understand and agree.</span>
        </label>
        <button
          type="button"
          className="thq-next"
          disabled={!agreed || !intake}
          onClick={() => { setSt((s) => ({ ...s, agreed: true })); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        >
          Start the assessment
        </button>
      </div>
    );
  }

  /* ── Quiz screens ── */
  const vq = visible();
  const n = vq.length;
  const q = vq[st.idx];
  // Every question counts, the eligibility ones and the medical ones, from the very first (it can change as answers
  // reveal or hide follow-up questions).
  const totalQs = n + healthQs.length;
  const sel = st.answers[q?.id]?.sel ?? [];

  /* ── Height and weight (the BMI is worked out from them) ── */
  if (st.view === 'q' && q?.type === 'measure') {
    const known = /calculated from (\d+(?:\.\d+)?) cm, (\d+(?:\.\d+)?) kg/.exec(st.answers[q.id]?.sel[0] ?? '');
    return (
      <div className="thq-in">
        <div className="thq-top">
          <button className="thq-arrow" onClick={back} disabled={st.idx === 0} aria-label="Back">←</button>
          <div className="thq-progress"><div className="thq-bar" style={{ width: `${Math.max(5, Math.round(st.idx / (totalQs + 1) * 100))}%` }} /></div>
          <div className="thq-count">Question {st.idx + 1} / {totalQs}</div>
        </div>
        <div className="thq-time">◷ Takes about 5 minutes</div>
        <h2 className="thq-q">{q.q}</h2>
        {q.help ? <p className="thq-help">{q.help}</p> : <div className="thq-spacer" />}
        <div className="thq-fields">
          <div className="thq-field">
            <label htmlFor="thq-h">Height (cm)</label>
            <input ref={hInputRef} id="thq-h" type="number" inputMode="decimal" min={120} max={230} placeholder="168" defaultValue={known?.[1]} />
          </div>
          <div className="thq-field">
            <label htmlFor="thq-w">Weight (kg)</label>
            <input ref={wInputRef} id="thq-w" type="number" inputMode="decimal" min={35} max={300} placeholder="92" defaultValue={known?.[2]} />
          </div>
        </div>
        {calcErr && <div className="thq-error">{calcErr}</div>}
        <button className="thq-next" onClick={doCalc}>
          Continue
        </button>
      </div>
    );
  }

  /* ── The medical questions ── */
  if (st.view === 'intake') {
    const total = n + healthQs.length;
    const hq = healthQs[st.idx];
    // Past the last one (or none showing): on to name and email.
    if (intake && !hq) {
      return (
        <div className="thq-in">
          <button className="thq-next" onClick={() => setSt((s) => ({ ...s, view: 'details' }))}>Continue</button>
        </div>
      );
    }
    return (
      <div className="thq-in">
        <div className="thq-top">
          <button className="thq-arrow" onClick={back} aria-label="Back">←</button>
          <div className="thq-progress"><div className="thq-bar" style={{ width: `${Math.max(5, Math.round((n + st.idx) / (total + 1) * 100))}%` }} /></div>
          <div className="thq-count">{hq ? `Question ${n + st.idx + 1} / ${total}` : ' '}</div>
        </div>
        {intakeFailed && (
          <div className="th-co-nosession" style={{ marginTop: 24 }}>
            <h2>We couldn’t load the next questions</h2>
            <p>Please check your connection and try again.</p>
            <button type="button" className="btn-primary" onClick={loadIntake}>Try again</button>
          </div>
        )}
        {!intake && !intakeFailed && <p className="thq-help" style={{ textAlign: 'center' }}>Loading…</p>}
        {hq && (
          <IntakeQuestionView
            key={hq.id}
            q={hq}
            values={health}
            onChange={(id, value) => setSt((s) => ({ ...s, health: { ...s.health, [id]: value } }))}
            onNext={(next) => {
              const visibleNow = (intake?.questions ?? []).filter((x) => isVisible(x, next) && !(x.id in prefilled));
              setSt((s) => ({ ...s, health: { ...s.health, ...next }, ...(st.idx < visibleNow.length - 1 ? { idx: st.idx + 1 } : { view: 'details' as const, idx: 0 }) }));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
      </div>
    );
  }

  /* ── Details form ── */
  if (st.view === 'details') {
    const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));

    const sendCode = async (c: { firstName: string; lastName: string; email: string }) => {
      setDetailsErr('');
      setCodeBusy(true);
      try {
        await requestEmailCode(c.email);
        setContact(c);
        setCode('');
        setCodeSent(true);
        setResendAt(Date.now() + 30_000);
        setNow(Date.now());
      } catch (err) {
        setDetailsErr(err instanceof Error ? err.message : 'We couldn’t send the code. Please try again.');
      } finally {
        setCodeBusy(false);
      }
    };

    const checkCode = async () => {
      if (!contact) return;
      setDetailsErr('');
      setCodeBusy(true);
      try {
        const token = await verifyEmailCode(contact.email, code);
        setProof({ email: contact.email, token });
        await submitDetails(contact.firstName, contact.lastName, contact.email, token);
      } catch (err) {
        setDetailsErr(err instanceof Error ? err.message : 'That code didn’t work. Please try again.');
      } finally {
        setCodeBusy(false);
      }
    };

    return (
      <div className="thq-in">
        <div className="thq-top">
          <button className="thq-arrow" onClick={codeSent ? () => { setCodeSent(false); setDetailsErr(''); } : back} aria-label="Back">←</button>
          <div className="thq-progress"><div className="thq-bar" style={{ width: '95%' }} /></div>
          <div className="thq-count">Last step</div>
        </div>
        <div className="thq-time">◷ Takes about 5 minutes</div>

        {!codeSent ? (
          <>
            <h2 className="thq-q">Where should we send your results?</h2>
            <p className="thq-help">Your doctor uses these details to review your answers. We’ll email you a code to confirm the address.</p>
            <form
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const c = { firstName: (fd.get('firstName') as string).trim(), lastName: (fd.get('lastName') as string).trim(), email: (fd.get('email') as string).trim() };
                if (!c.firstName || !c.lastName) { setDetailsErr('Please enter your first and last name.'); return; }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) { setDetailsErr('Please enter a valid email address.'); return; }
                setEmailTaken(false);
                // Already proved for this address on this page (for instance saving failed): no second code.
                if (proof && proof.email.toLowerCase() === c.email.toLowerCase()) { setContact(c); setDetailsErr(''); await submitDetails(c.firstName, c.lastName, c.email, proof.token); return; }
                await sendCode(c);
              }}
            >
              <div className="thq-fields">
                <div className="thq-field">
                  <label htmlFor="thq-fn">First name</label>
                  <input id="thq-fn" name="firstName" type="text" autoComplete="given-name" defaultValue={contact?.firstName} />
                </div>
                <div className="thq-field">
                  <label htmlFor="thq-ln">Last name</label>
                  <input id="thq-ln" name="lastName" type="text" autoComplete="family-name" defaultValue={contact?.lastName} />
                </div>
                <div className="thq-field-full">
                  <label htmlFor="thq-em">Email</label>
                  <input id="thq-em" name="email" type="email" autoComplete="email" defaultValue={contact?.email} />
                </div>
              </div>
              {emailTaken && (
                <div className="thq-error" role="alert">
                  An account already exists for this email.{' '}
                  <a href={`${CONFIG.PORTAL_URL}/login`} style={{ textDecoration: 'underline', fontWeight: 600 }}>Sign in</a>
                  {' '}instead, or use a different email address.
                </div>
              )}
              {detailsErr && <div className="thq-error" role="alert">{detailsErr}</div>}
              <button type="submit" className="thq-next" disabled={saving || codeBusy}>
                {codeBusy ? 'Sending the code…' : saving ? 'Saving…' : 'Send me a code'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2 className="thq-q">Check your email</h2>
            <p className="thq-help">We sent a six-digit code to <strong>{contact?.email}</strong>. It can take a minute to arrive; check your spam folder too.</p>
            <form
              noValidate
              onSubmit={(e) => { e.preventDefault(); if (/^\d{6}$/.test(code.trim())) void checkCode(); else setDetailsErr('Please enter the six digits from the email.'); }}
            >
              <div className="thq-field-full">
                <label htmlFor="thq-code">Verification code</label>
                <input
                  id="thq-code"
                  className="thq-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                />
              </div>
              {emailTaken && (
                <div className="thq-error" role="alert">
                  An account already exists for this email.{' '}
                  <a href={`${CONFIG.PORTAL_URL}/login`} style={{ textDecoration: 'underline', fontWeight: 600 }}>Sign in</a>
                  {' '}instead, or use a different email address.
                </div>
              )}
              {detailsErr && <div className="thq-error" role="alert">{detailsErr}</div>}
              <button type="submit" className="thq-next" disabled={saving || codeBusy || code.length !== 6}>
                {saving || codeBusy ? 'Checking…' : 'Confirm and see my treatments'}
              </button>
              <p className="thq-resend">
                Didn’t get it?{' '}
                <button type="button" disabled={cooldown > 0 || codeBusy} onClick={() => contact && sendCode(contact)}>
                  {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send a new code'}
                </button>
                {' · '}
                <button type="button" onClick={() => { setCodeSent(false); setDetailsErr(''); }}>Use a different email</button>
              </p>
            </form>
          </>
        )}
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
          <div className="thq-bar" style={{ width: `${Math.max(5, Math.round(st.idx / (totalQs + 1) * 100))}%` }} />
        </div>
        <div className="thq-count">Question {st.idx + 1} / {totalQs}</div>
      </div>
      {restored && (
        <div className="thq-restored" role="status">
          Welcome back — we've kept your answers.{' '}
          <button type="button" onClick={restart}>Start over</button>
        </div>
      )}
      <div className="thq-time">◷ Takes about 5 minutes</div>
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
