'use client';

import { useState } from 'react';
import type { CompareRow } from '@/lib/returning';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Shown to someone who answered the quiz before and never paid: their earlier answers beside today's, and a choice of
 * which to go on with. The changed answers come first; the ones that stayed the same are one tap away.
 */
export default function ReturningChoice({
  firstName, savedAt, rows, canKeep, blockedReason, busy, error, onUseToday, onKeepEarlier, onBack,
}: {
  firstName: string;
  savedAt: string;
  rows: CompareRow[];
  canKeep: boolean;
  blockedReason: string | null;
  busy: boolean;
  error: string;
  onUseToday: () => void;
  onKeepEarlier: () => void;
  onBack: () => void;
}) {
  const [showSame, setShowSame] = useState(false);
  const changed = rows.filter((r) => r.changed);
  const same = rows.filter((r) => !r.changed);
  const show = showSame ? [...changed, ...same] : changed;

  return (
    <div className="thq-in">
      <div className="thq-top">
        <button className="thq-arrow" onClick={onBack} aria-label="Back" disabled={busy}>←</button>
        <div className="thq-progress"><div className="thq-bar" style={{ width: '98%' }} /></div>
        <div className="thq-count">Almost done</div>
      </div>

      <h2 className="thq-q">Welcome back, {firstName}</h2>
      <p className="thq-help">
        You answered these questions on {when(savedAt)} but didn’t finish your order.{' '}
        {changed.length === 1 ? '1 answer is' : `${changed.length} answers are`} different today. Choose which answers you’d like to go on with.
      </p>

      <div className="thq-cmp" role="table" aria-label="Your earlier answers compared with today’s">
        <div className="thq-cmp-head" role="row">
          <span role="columnheader">Question</span>
          <span role="columnheader">Before</span>
          <span role="columnheader">Today</span>
        </div>
        {show.map((r) => (
          <div key={r.id} className={`thq-cmp-row${r.changed ? ' is-changed' : ''}`} role="row">
            <span className="thq-cmp-q" role="cell">{r.question}</span>
            <span className="thq-cmp-a" role="cell"><em>Before</em>{r.earlier ?? '—'}</span>
            <span className="thq-cmp-a thq-cmp-today" role="cell"><em>Today</em>{r.today ?? '—'}</span>
          </div>
        ))}
      </div>
      {same.length > 0 && (
        <button type="button" className="thq-cmp-toggle" onClick={() => setShowSame((v) => !v)}>
          {showSame ? 'Hide the answers that stayed the same' : `Show the ${same.length} answers that stayed the same`}
        </button>
      )}

      {error && <div className="thq-error" role="alert">{error}</div>}

      <button type="button" className="thq-next" disabled={busy} onClick={onUseToday}>
        {busy ? 'Saving…' : 'Use today’s answers'}
      </button>
      <button type="button" className="thq-next thq-next-alt" disabled={busy || !canKeep} onClick={onKeepEarlier}>
        Keep my earlier answers
      </button>
      {!canKeep && blockedReason && <p className="thq-help" style={{ marginTop: 12 }}>{blockedReason}</p>}
      <p className="thq-help" style={{ marginTop: 16 }}>Either way, a doctor reads every answer before anything is prescribed.</p>
    </div>
  );
}
