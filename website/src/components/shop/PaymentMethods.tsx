'use client';

import { money, type PaymentMethod } from '@/lib/shop';

/** Visa and Mastercard acceptance marks, drawn small so no image has to load. */
export function CardMarks() {
  return (
    <span className="pm-marks" aria-label="Visa and Mastercard">
      <span className="pm-mark pm-visa" aria-hidden="true">VISA</span>
      <span className="pm-mark pm-mc" aria-hidden="true">
        <svg width="26" height="16" viewBox="0 0 26 16"><circle cx="9" cy="8" r="7" fill="#EB001B" /><circle cx="17" cy="8" r="7" fill="#F79E1B" fillOpacity=".9" /></svg>
      </span>
    </span>
  );
}

const icon = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function MethodIcon({ method }: { method: PaymentMethod }) {
  if (method.key === 'COD') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" {...icon} aria-hidden="true">
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      </svg>
    );
  }
  if (method.key === 'BANK_TRANSFER') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" {...icon} aria-hidden="true">
        <path d="M4 9h14l-3-3M20 15H6l3 3" />
      </svg>
    );
  }
  return <CardMarks />;
}

interface Props {
  methods: PaymentMethod[];
  value: string | null;
  onChange: (key: string) => void;
  totalCents: number;
  currency: string;
  codMaxCents: number | null;
  transferHoldDays: number;
  /** Raiffeisen's (or the test) card form, once the order exists: shown inside the card option. */
  cardFrame?: React.ReactNode;
  disabled?: boolean;
}

/** How the buyer pays: card first (recommended), then pay on delivery and bank transfer, each opening to say what happens. */
export default function PaymentMethods({ methods, value, onChange, totalCents, currency, codMaxCents, transferHoldDays, cardFrame, disabled }: Props) {
  const firstCard = methods.find((m) => m.kind === 'CARD')?.key;
  return (
    <div className="pm-list" role="radiogroup" aria-label="How would you like to pay?">
      {methods.map((m) => {
        const on = value === m.key;
        const codTooHigh = m.key === 'COD' && codMaxCents !== null && totalCents > codMaxCents;
        return (
          <div key={m.key} className={`pm-item${on ? ' is-on' : ''}${codTooHigh ? ' is-off' : ''}`}>
            <button type="button" role="radio" aria-checked={on} className="pm-head" disabled={disabled || codTooHigh} onClick={() => onChange(m.key)}>
              <span className="pm-radio" aria-hidden="true" />
              <span className="pm-title">
                <span className="pm-label">{title(m)}</span>
                {m.key === firstCard && m.key !== 'DEV' && <span className="pm-badge">Recommended</span>}
                {m.kind === 'OFFLINE' && <span className="pm-sub">{m.key === 'COD' ? 'Cash, or card on the courier’s terminal' : 'For businesses or accounts with limits'}</span>}
              </span>
              <span className="pm-icon"><MethodIcon method={m} /></span>
            </button>
            {on && (
              <div className="pm-body">
                {m.kind === 'CARD' && (cardFrame ?? (
                  <>
                    <p>{m.description}</p>
                    <p className="pm-note">
                      {m.key === 'STRIPE' ? 'After you press Pay, you continue on Stripe’s secure page.' : 'After you press Pay, the bank’s secure card form opens right here.'} Your bank may ask you to approve the payment in its app or with an SMS code.
                    </p>
                  </>
                ))}
                {m.key === 'COD' && (
                  <p>You pay <strong>{money(totalCents, currency)}</strong> when the parcel arrives: in cash, or by card on the courier’s terminal. Please keep your phone with you so the courier can reach you.</p>
                )}
                {m.key === 'BANK_TRANSFER' && (
                  <p>After you place the order we show you our bank details and email them to you. We hold your order for {transferHoldDays} day{transferHoldDays === 1 ? '' : 's'} and send it as soon as the money arrives.</p>
                )}
              </div>
            )}
            {codTooHigh && <p className="pm-off-note">Pay on delivery is available for orders up to {money(codMaxCents!, currency)}.</p>}
          </div>
        );
      })}
    </div>
  );
}

function title(m: PaymentMethod) {
  if (m.key === 'DEV') return 'Test card payment';
  return m.label;
}
