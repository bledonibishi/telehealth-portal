// Same file lives in web/src/components/consultation and clinician/src/components/consultation.

export type TickState = 'sending' | 'sent' | 'read';

/** Where one of your own messages has got to. Read only once the other side has had the conversation open. */
export const tickStateOf = (m: { pending?: boolean; readAt?: string | null }): TickState => (m.pending ? 'sending' : m.readAt ? 'read' : 'sent');

const LABEL: Record<TickState, string> = { sending: 'Sending', sent: 'Delivered', read: 'Read' };

/**
 * The ticks beside your own message: one while it is on its way, two once it has arrived, and two blue ones
 * once it has been read. `onDark` is for a bubble with a dark background, where grey would not show.
 */
export function MessageTicks({ state, onDark = false }: { state: TickState; onDark?: boolean }) {
  const colour = state === 'read' ? (onDark ? '#7dd3fc' : '#0ea5e9') : onDark ? 'rgba(255,255,255,0.65)' : '#94a3b8';
  return (
    <svg viewBox="0 0 20 12" width="18" height="11" role="img" aria-label={LABEL[state]} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <title>{LABEL[state]}</title>
      <path d="M1 6.5 4.5 10 11 2" fill="none" stroke={colour} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {state !== 'sending' && <path d="M8.5 9 9.5 10 16 2" fill="none" stroke={colour} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
