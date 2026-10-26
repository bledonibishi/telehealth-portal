'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { COUNTRY_NAMES, ShopError, money, orderToken, shopApi, type ShopOrderView } from '@/lib/shop';

// After a successful payment the provider's notification can take a few seconds; the page asks again meanwhile.
const POLL_MS = 3000;
const POLL_FOR_MS = 90_000;

function OrderPage() {
  const { reference } = useParams<{ reference: string }>();
  const result = useSearchParams().get('result');
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [order, setOrder] = useState<ShopOrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const started = useRef(Date.now());

  // The bank's card form (inside the checkout) sends its frame here when it finishes: show the order full-page.
  useEffect(() => {
    if (window.top && window.top !== window.self) {
      try {
        window.top.location.href = window.location.href;
      } catch {
        /* a frame on another site: stay */
      }
    }
  }, []);

  useEffect(() => setToken(orderToken(reference)), [reference]);

  const load = useCallback(async () => {
    if (!token) return null;
    try {
      const o = await shopApi.order(reference, token);
      setOrder(o);
      setError(null);
      return o;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong on our side. Please try again.');
      return null;
    }
  }, [reference, token]);

  useEffect(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout>;
    let live = true;
    const tick = async () => {
      const o = await load();
      const waiting = o?.status === 'AWAITING_PAYMENT' && o.payment?.status === 'PENDING' && result === 'success';
      if (live && waiting && Date.now() - started.current < POLL_FOR_MS) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [token, load, result]);

  const retry = async (provider: string) => {
    if (!token) return;
    setRetrying(provider);
    setError(null);
    try {
      const { redirectUrl } = await shopApi.pay(reference, token, provider);
      window.location.assign(redirectUrl);
    } catch (e) {
      setError(e instanceof ShopError ? e.message : 'Something went wrong on our side. Please try again.');
      setRetrying(null);
      load();
    }
  };

  if (token === null) {
    return (
      <Card icon="✉" title={`Order ${reference}`}>
        <p className="pv-result-sub">We can only show this order in the browser it was placed from. Your order details and its status are in the emails we send you.</p>
        <Link href="/shop" className="btn-secondary" style={{ justifyContent: 'center' }}>Back to the shop</Link>
      </Card>
    );
  }

  if (!order) {
    return (
      <Card icon="…" title={error ? 'We couldn’t load your order' : 'Loading your order…'}>
        {error && <p className="pv-result-sub">{error}</p>}
      </Card>
    );
  }

  const cod = order.provider === 'COD';
  const transfer = order.status === 'AWAITING_PAYMENT' && order.bankTransfer;
  const paidOnDelivery = cod && !order.paidAt;
  const paid = !paidOnDelivery && (order.status === 'PAID' || order.status === 'DISPATCHED' || order.status === 'DELIVERED');
  const confirmed = order.status === 'CONFIRMED' || (paidOnDelivery && (order.status === 'DISPATCHED' || order.status === 'DELIVERED'));
  const confirming = !transfer && order.status === 'AWAITING_PAYMENT' && order.payment?.status === 'PENDING' && result === 'success';
  const failed = !transfer && order.status === 'AWAITING_PAYMENT' && (order.payment?.status === 'FAILED' || order.payment?.status === 'CANCELLED' || result === 'failed' || result === 'cancelled');

  const title = paid || confirmed
    ? order.status === 'DISPATCHED' ? 'Your order is on its way' : order.status === 'DELIVERED' ? 'Your order was delivered' : confirmed ? 'Your order is confirmed' : 'Thank you for your order'
    : order.status === 'REFUNDED' ? 'Your order was refunded'
    : order.status === 'CANCELLED' ? 'This order was cancelled'
    : transfer ? 'Waiting for your bank transfer'
    : confirming ? 'Confirming your payment…'
    : failed ? 'Your payment didn’t go through'
    : 'Waiting for your payment';

  return (
    <Card icon={paid || confirmed ? '✓' : failed || order.status === 'CANCELLED' ? '✕' : '…'} tone={paid || confirmed ? 'ok' : failed ? 'bad' : undefined} title={title}>
      <p className="pv-result-sub">
        {confirmed && order.status !== 'DELIVERED' && <>You pay <strong>{money(order.totalCents, order.currency)}</strong> to the courier when it arrives: in cash, or by card on their terminal. We’ve emailed a confirmation to <strong>{order.email}</strong>.</>}
        {transfer && <>Please transfer the amount below, with your order reference as the description. We send your order as soon as the money arrives.</>}
        {paid && <>We’ve received your payment and emailed a confirmation to <strong>{order.email}</strong>. We’ll let you know when it’s sent.</>}
        {order.status === 'REFUNDED' && <>We refunded {money(order.refundedCents, order.currency)}{cod || order.provider === 'BANK_TRANSFER' ? '' : ' to the card you paid with. It usually shows within 5 to 10 working days'}.</>}
        {order.status === 'CANCELLED' && <>It wasn’t paid in time, so nothing was charged. You can place a new order whenever you like.</>}
        {confirming && <>This usually takes a few seconds. Please don’t pay again.</>}
        {failed && (order.payment?.failureMessage ?? (order.payment?.status === 'CANCELLED' || result === 'cancelled' ? 'The payment was cancelled, so nothing was charged.' : 'Nothing was charged. Please try again or use another card.'))}
        {order.status === 'AWAITING_PAYMENT' && !confirming && !failed && !transfer && <>Your order is reserved for a short while. Finish paying to complete it.</>}
      </p>

      {order.bankTransfer && transfer && <TransferDetails details={order.bankTransfer} currency={order.currency} />}

      {order.status === 'AWAITING_PAYMENT' && !confirming && order.paymentMethods.length > 0 && (
        <div className="shop-retry">
          {order.paymentMethods.filter((m) => !(transfer && m.key === 'BANK_TRANSFER')).map((m) => (
            <button key={m.key} type="button" className={m.kind === 'CARD' && !transfer ? 'btn-primary' : 'btn-secondary'} onClick={() => retry(m.key)} disabled={retrying !== null}>
              {retrying === m.key ? 'One moment…' : m.kind === 'CARD' ? `${failed ? 'Try again' : transfer ? 'Pay by card instead' : 'Pay'}${transfer ? '' : `: ${m.key === 'DEV' ? 'test card payment' : m.label.toLowerCase()}`}` : `${m.label} instead`}
            </button>
          ))}
        </div>
      )}
      {error && <div className="th-co-pay-error" role="alert">{error}</div>}

      <div className="shop-order-box">
        <div className="shop-order-ref">Order {order.reference}</div>
        {order.items.map((i, n) => (
          <div key={n} className="th-co-row"><span>{i.name} × {i.quantity}</span><span>{money(i.unitPriceCents * i.quantity, order.currency)}</span></div>
        ))}
        <div className="th-co-row"><span>Delivery</span><span>{order.shippingCents ? money(order.shippingCents, order.currency) : 'Free'}</span></div>
        <div className="th-co-row total"><span>Total</span><span>{money(order.totalCents, order.currency)}</span></div>
        <p className="th-co-note">
          Delivering to {order.shippingAddress.line1}, {order.shippingAddress.city}
          {order.shippingAddress.postalCode && ` ${order.shippingAddress.postalCode}`}, {COUNTRY_NAMES[order.shippingAddress.country] ?? order.shippingAddress.country}
          {order.carrier || order.trackingNumber ? ` · Tracking: ${[order.carrier, order.trackingNumber].filter(Boolean).join(' ')}` : ''}
        </p>
        {order.payment?.cardSummary && paid && <p className="th-co-note">Paid with {order.payment.cardSummary}</p>}
      </div>

      <Link href="/shop" className="btn-secondary" style={{ justifyContent: 'center' }}>Back to the shop</Link>
    </Card>
  );
}

function TransferDetails({ details: d, currency }: { details: NonNullable<ShopOrderView['bankTransfer']>; currency: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (label: string, value: string) => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    }, () => undefined);
  };
  const rows: Array<[string, string, string?]> = [
    ['Amount', money(d.amountCents, currency)],
    ['Account holder', d.accountName],
    ['IBAN', d.iban.replace(/(.{4})/g, '$1 ').trim(), d.iban],
    ...(d.bankName ? ([['Bank', d.bankName]] as Array<[string, string]>) : []),
    ['Description', d.reference, d.reference],
  ];
  return (
    <div className="pm-transfer">
      {rows.map(([label, shown, copyValue]) => (
        <div key={label} className="pm-transfer-row">
          <span>{label}</span>
          <strong>{shown}</strong>
          {copyValue && <button type="button" onClick={() => copy(label, copyValue)}>{copied === label ? 'Copied ✓' : 'Copy'}</button>}
        </div>
      ))}
      <p className="th-co-note">We hold your order until {new Date(d.payBy).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.</p>
    </div>
  );
}

function Card({ icon, title, tone, children }: { icon: string; title: string; tone?: 'ok' | 'bad'; children?: React.ReactNode }) {
  return (
    <>
      <main className="pv-result-page">
        <div className="pv-result-card">
          <div className={`pv-result-icon${tone === 'bad' ? ' cancel' : tone === 'ok' ? ' success' : ''}`}>{icon}</div>
          <h1 className="pv-result-h1">{title}</h1>
          {children}
        </div>
      </main>
    </>
  );
}

export default function ShopOrderPage() {
  return (
    <Suspense>
      <OrderPage />
    </Suspense>
  );
}
