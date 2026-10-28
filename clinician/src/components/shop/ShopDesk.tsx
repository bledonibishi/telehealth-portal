'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import {
  CANCEL_SHOP_ORDER,
  MARK_FISCAL_RECEIPT_ISSUED,
  MARK_SHOP_ORDER_DELIVERED,
  MARK_SHOP_ORDER_DISPATCHED,
  MARK_SHOP_PAYMENT_RECEIVED,
  PENDING_FISCAL_RECEIPTS,
  REFUND_SHOP_ORDER,
  SAVE_SHOP_PRODUCT,
  SHOP_ORDERS,
  SHOP_PRODUCTS,
} from '@/graphql/shop';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { ErrorAlert, InlineError } from '@/components/ui/Alert';
import { getCurrentRole } from '@/lib/role';

const money = (cents: number | null | undefined, currency = 'eur') => {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
};

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Awaiting payment', CONFIRMED: 'To send, pay on delivery', PAID: 'Paid, to send', DISPATCHED: 'Sent', DELIVERED: 'Delivered', CANCELLED: 'Cancelled', REFUNDED: 'Refunded',
};
const STATUS_CLS: Record<string, string> = {
  AWAITING_PAYMENT: 'bg-gray-100 text-gray-700', CONFIRMED: 'bg-amber-100 text-amber-800', PAID: 'bg-amber-100 text-amber-800', DISPATCHED: 'bg-sky-100 text-sky-800',
  DELIVERED: 'bg-green-100 text-green-800', CANCELLED: 'bg-gray-100 text-gray-500', REFUNDED: 'bg-purple-100 text-purple-800',
};
const PROVIDER_LABEL: Record<string, string> = { RAIACCEPT: 'Raiffeisen (RaiAccept)', STRIPE: 'Stripe', DEV: 'Test payment', COD: 'Pay on delivery', BANK_TRANSFER: 'Bank transfer' };
/** Paid by hand: staff record the money, and refunds are given back by hand. */
const OFFLINE = ['COD', 'BANK_TRANSFER'];

type TabKey = 'orders' | 'products' | 'receipts';

/** The shop for staff: orders to send, refunds, the products on sale, and the fiscal receipts still owed. */
export default function ShopDesk() {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabKey>('orders');
  // Support (CX_TEAM) sees orders and records payments and receipts; products, sending and refunds are for admins.
  const isAdmin = getCurrentRole() === 'ADMIN';
  const { data: receiptData } = useQuery(PENDING_FISCAL_RECEIPTS, { pollInterval: 60_000, fetchPolicy: 'cache-and-network' });
  const owed = receiptData?.pendingFiscalReceipts?.length ?? 0;

  const TABS: Array<{ key: TabKey; label: string; hint: string }> = [
    { key: 'orders', label: 'Orders', hint: 'Paid orders to send, refunds and cancellations' },
    ...(isAdmin ? [{ key: 'products' as const, label: 'Products', hint: 'What is on sale, prices and stock' }] : []),
    { key: 'receipts', label: `Fiscal receipts${owed ? ` (${owed})` : ''}`, hint: 'Sales and refunds still waiting for their fiscal receipt' },
  ];

  return (
    <div>
      <div className={`px-4 sm:px-6 pt-4 grid grid-cols-1 ${isAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3`}>
        {TABS.map((x) => (
          <button key={x.key} type="button" onClick={() => setTab(x.key)}
            className={`text-left rounded-lg border px-4 py-3 ${tab === x.key ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
            <span className="block text-sm font-medium text-gray-800">{t(x.label)}</span>
            <span className="block text-xs text-gray-500 mt-0.5">{t(x.hint)}</span>
          </button>
        ))}
      </div>
      <div className="px-4 sm:px-6 py-4">
        {tab === 'orders' && <Orders isAdmin={isAdmin} />}
        {tab === 'products' && isAdmin && <Products />}
        {tab === 'receipts' && <Receipts />}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500">{children}</p>;
}

/* ── Orders ── */

const FILTERS: Array<{ key: string | null; label: string }> = [
  { key: 'PAID', label: 'To send' },
  { key: 'CONFIRMED', label: 'To send, pay on delivery' },
  { key: 'AWAITING_PAYMENT', label: 'Awaiting payment' },
  { key: 'DISPATCHED', label: 'Sent' },
  { key: null, label: 'All' },
];

function Orders({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<string | null>('PAID');
  const [search, setSearch] = useState('');
  const { data, loading, error, refetch } = useQuery(SHOP_ORDERS, { variables: { status, search: search.trim() || null }, pollInterval: 60_000, fetchPolicy: 'cache-and-network' });
  const orders: any[] = data?.shopOrders ?? [];
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.label} type="button" onClick={() => setStatus(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${status === f.key ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
            {t(f.label)}
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search reference, email or surname')}
          className="ml-auto w-full sm:w-72 rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
      </div>
      {error && <ErrorAlert error={error} onRetry={() => refetch()} />}
      {!loading && !error && orders.length === 0 && <Empty>{t('No orders here.')}</Empty>}
      <ul className="space-y-3">
        {orders.map((o) => (
          <OrderRow key={o.id} order={o} isAdmin={isAdmin} open={openId === o.id} onToggle={() => setOpenId(openId === o.id ? null : o.id)} />
        ))}
      </ul>
    </div>
  );
}

function OrderRow({ order: o, isAdmin, open, onToggle }: { order: any; isAdmin: boolean; open: boolean; onToggle: () => void }) {
  const { t, timeAgo } = useI18n();
  const [error, setError] = useState<unknown>(null);
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const opts = { refetchQueries: [SHOP_ORDERS, PENDING_FISCAL_RECEIPTS], onError: (e: unknown) => setError(e), onCompleted: () => setError(null) };
  const [dispatch, { loading: dispatching }] = useMutation(MARK_SHOP_ORDER_DISPATCHED, opts);
  const [deliver, { loading: delivering }] = useMutation(MARK_SHOP_ORDER_DELIVERED, opts);
  const [cancel, { loading: cancelling }] = useMutation(CANCEL_SHOP_ORDER, opts);
  const [received, { loading: recording }] = useMutation(MARK_SHOP_PAYMENT_RECEIVED, opts);
  const [refund, { loading: refunding }] = useMutation(REFUND_SHOP_ORDER, { ...opts, onCompleted: () => { setError(null); setRefundOpen(false); setConfirmRefund(false); } });

  const refundable = o.payments.filter((p: any) => p.status === 'SUCCEEDED').reduce((s: number, p: any) => s + p.amountCents, 0) - o.refundedCents;
  const refundCents = refundAmount.trim() ? Math.round(Number(refundAmount.replace(',', '.')) * 100) : refundable;
  const canRefund = isAdmin && ['PAID', 'DISPATCHED', 'DELIVERED'].includes(o.status) && refundable > 0;
  const offline = OFFLINE.includes(o.provider);
  // Money still to come by hand: a pay-on-delivery parcel, or a bank transfer.
  const awaitingHandPayment = offline && !o.paidAt && ['AWAITING_PAYMENT', 'CONFIRMED', 'DISPATCHED', 'DELIVERED'].includes(o.status);

  return (
    <li className={`rounded-lg border bg-white ${o.paidTwice ? 'border-red-300' : 'border-gray-200'}`}>
      <button type="button" onClick={onToggle} className="w-full px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-left">
        <span className="font-mono text-sm font-semibold text-gray-900">{o.reference}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS_CLS[o.status] ?? ''}`}>{t(STATUS_LABEL[o.status] ?? o.status)}</span>
        <span className="text-sm text-gray-700">{o.firstName} {o.lastName}</span>
        <span className="text-sm font-medium text-gray-900">{money(o.totalCents, o.currency)}</span>
        <span className="text-xs text-gray-500">{t(PROVIDER_LABEL[o.provider] ?? o.provider)}{awaitingHandPayment ? ` · ${t('not paid yet')}` : ''}</span>
        <span className="ml-auto text-xs text-gray-500">{timeAgo(o.paidAt ?? o.createdAt)}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4 text-sm">
          {o.paidTwice && (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900">
              {t('This order was paid twice (two payment tries both went through). Refund one of the payments.')}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Items')}</p>
              <ul className="mt-1 space-y-0.5">
                {o.items.map((i: any, n: number) => <li key={n}>{i.name} × {i.quantity} · {money(i.unitPriceCents * i.quantity, o.currency)}</li>)}
                <li className="text-gray-600">{t('Delivery')} · {o.shippingCents ? money(o.shippingCents, o.currency) : t('Free')}</li>
                {o.refundedCents > 0 && <li className="text-purple-700">{t('Refunded')} · {money(o.refundedCents, o.currency)}</li>}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Deliver to')}</p>
              <p className="mt-1">{o.firstName} {o.lastName}<br />{o.address}<br /><span className="text-gray-600">{o.email}{o.phone ? ` · ${o.phone}` : ''}</span></p>
              {(o.carrier || o.trackingNumber) && <p className="mt-1 text-gray-600">{t('Tracking')}: {[o.carrier, o.trackingNumber].filter(Boolean).join(' ')}</p>}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Payments')}</p>
            <ul className="mt-1 space-y-0.5">
              {o.payments.map((p: any) => (
                <li key={p.id} className="text-gray-700">
                  #{p.attempt} · {PROVIDER_LABEL[p.provider] ?? p.provider} · <strong>{p.status}</strong> · {money(p.amountCents, o.currency)}
                  {p.cardSummary && ` · ${p.cardSummary}`}
                  {p.providerOrderId && <span className="text-gray-500"> · {p.providerOrderId}</span>}
                  {p.failureMessage && <span className="block text-xs text-gray-500">{p.failureMessage}</span>}
                </li>
              ))}
            </ul>
          </div>

          {awaitingHandPayment && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3">
              <span className="text-sm text-amber-900">
                {o.provider === 'COD'
                  ? t('The buyer pays {amount} to the courier. Record it when the courier hands the money over.', { amount: money(o.totalCents, o.currency) })
                  : t('Waiting for a bank transfer of {amount} with the reference {reference}.', { amount: money(o.totalCents, o.currency), reference: o.reference })}
              </span>
              <button type="button" disabled={recording} onClick={() => received({ variables: { orderId: o.id } })}
                className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {recording ? t('Saving…') : t('Payment received')}
              </button>
            </div>
          )}
          {isAdmin && (o.status === 'PAID' || o.status === 'CONFIRMED') && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-gray-600">{t('Courier')}<input value={carrier} onChange={(e) => setCarrier(e.target.value)} className="mt-0.5 block rounded-md border border-gray-300 px-2 py-1.5 text-sm" /></label>
              <label className="text-xs text-gray-600">{t('Tracking number')}<input value={tracking} onChange={(e) => setTracking(e.target.value)} className="mt-0.5 block rounded-md border border-gray-300 px-2 py-1.5 text-sm" /></label>
              <button type="button" disabled={dispatching} onClick={() => dispatch({ variables: { orderId: o.id, carrier: carrier || null, trackingNumber: tracking || null } })}
                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {dispatching ? t('Saving…') : t('Mark as sent')}
              </button>
            </div>
          )}
          {isAdmin && o.status === 'DISPATCHED' && (
            <button type="button" disabled={delivering} onClick={() => deliver({ variables: { orderId: o.id } })}
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {delivering ? t('Saving…') : t('Mark as delivered')}
            </button>
          )}
          {isAdmin && (o.status === 'AWAITING_PAYMENT' || (awaitingHandPayment && ['CONFIRMED', 'DISPATCHED'].includes(o.status))) && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-gray-600">{t('Reason')}<input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="mt-0.5 block w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm" /></label>
              <button type="button" disabled={cancelling} onClick={() => cancel({ variables: { orderId: o.id, reason: cancelReason || 'Cancelled by staff' } })}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {cancelling ? t('Saving…') : o.status === 'DISPATCHED' ? t('Refused or returned: cancel and put the stock back') : t('Cancel order and release stock')}
              </button>
            </div>
          )}

          {canRefund && !refundOpen && (
            <button type="button" onClick={() => setRefundOpen(true)} className="text-sm font-medium text-purple-700 hover:text-purple-800">{t('Refund…')}</button>
          )}
          {canRefund && refundOpen && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-gray-700">{t('Amount (€), empty for everything left')}
                  <input value={refundAmount} onChange={(e) => { setRefundAmount(e.target.value); setConfirmRefund(false); }} placeholder={(refundable / 100).toFixed(2)} inputMode="decimal" className="mt-0.5 block w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs text-gray-700">{t('Reason')}
                  <input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} className="mt-0.5 block w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                </label>
              </div>
              {o.status === 'PAID' && (
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
                  {t('Put the items back on sale (only for a full refund before it is sent)')}
                </label>
              )}
              {!confirmRefund ? (
                <button type="button" onClick={() => setConfirmRefund(true)} disabled={!(refundCents > 0 && refundCents <= refundable)}
                  className="rounded-md bg-purple-700 px-3 py-2 text-sm font-medium text-white hover:bg-purple-800 disabled:opacity-50">
                  {t('Refund {amount}', { amount: money(refundCents, o.currency) })}
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-purple-900">
                    {offline
                      ? t('This records a refund of {amount}. Give the money back by hand (cash or a bank transfer to the buyer).', { amount: money(refundCents, o.currency) })
                      : t('This sends {amount} back to the buyer’s card. It can’t be undone.', { amount: money(refundCents, o.currency) })}
                  </span>
                  <button type="button" disabled={refunding}
                    onClick={() => refund({ variables: { input: { orderId: o.id, amountCents: refundAmount.trim() ? refundCents : null, reason: refundReason || null, restock: o.status === 'PAID' && restock } } })}
                    className="rounded-md bg-purple-700 px-3 py-2 text-sm font-medium text-white hover:bg-purple-800 disabled:opacity-50">
                    {refunding ? t('Refunding…') : t('Yes, refund')}
                  </button>
                  <button type="button" onClick={() => setConfirmRefund(false)} className="text-sm text-gray-600">{t('Cancel')}</button>
                </div>
              )}
            </div>
          )}
          <InlineError error={error} />
        </div>
      )}
    </li>
  );
}

/* ── Products ── */

interface ProductForm {
  id?: string;
  name: string;
  slug: string;
  brand: string;
  category: string;
  price: string;
  vatRate: string;
  stock: string;
  maxPerOrder: string;
  imageUrl: string;
  description: string;
  active: boolean;
  sortOrder: string;
}

const NEW_PRODUCT: ProductForm = { name: '', slug: '', brand: '', category: '', price: '', vatRate: '18', stock: '0', maxPerOrder: '10', imageUrl: '', description: '', active: true, sortOrder: '0' };

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function Products() {
  const { t } = useI18n();
  const { data, loading, error, refetch } = useQuery(SHOP_PRODUCTS, { fetchPolicy: 'cache-and-network' });
  const products: any[] = data?.shopProducts ?? [];
  const [form, setForm] = useState<ProductForm | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setForm({ ...NEW_PRODUCT })} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">{t('Add product')}</button>
      </div>
      {form && <ProductEditor form={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); refetch(); }} />}
      {error && <ErrorAlert error={error} onRetry={() => refetch()} />}
      {!loading && !error && products.length === 0 && <Empty>{t('No products yet. Add the first one to open the shop.')}</Empty>}
      {products.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th className="px-3 py-2">{t('Product')}</th><th className="px-3 py-2">{t('Price')}</th><th className="px-3 py-2">{t('VAT')}</th><th className="px-3 py-2">{t('Stock')}</th><th className="px-3 py-2">{t('On sale')}</th><th /></tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-3 py-2"><span className="font-medium text-gray-900">{p.name}</span>{p.brand && <span className="text-gray-500"> · {p.brand}</span>}<span className="block text-xs text-gray-400">/shop/{p.slug}</span></td>
                  <td className="px-3 py-2">{money(p.priceCents, p.currency)}</td>
                  <td className="px-3 py-2">{p.vatRate}%</td>
                  <td className={`px-3 py-2 ${p.stock <= 0 ? 'font-semibold text-red-700' : ''}`}>{p.stock}</td>
                  <td className="px-3 py-2">{p.active ? t('Yes') : t('No')}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-700"
                      onClick={() => setForm({ id: p.id, name: p.name, slug: p.slug, brand: p.brand ?? '', category: p.category ?? '', price: (p.priceCents / 100).toFixed(2), vatRate: String(p.vatRate), stock: String(p.stock), maxPerOrder: String(p.maxPerOrder), imageUrl: p.imageUrl ?? '', description: p.description ?? '', active: p.active, sortOrder: String(p.sortOrder) })}>
                      {t('Edit')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProductEditor({ form: initial, onClose, onSaved }: { form: ProductForm; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<unknown>(null);
  const [save, { loading }] = useMutation(SAVE_SHOP_PRODUCT, { onError: (e) => setError(e), onCompleted: onSaved });
  const set = (k: keyof ProductForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((f) => ({ ...f, [k]: value, ...(k === 'name' && !f.id && { slug: slugify(String(value)) }) }));
  };
  const submit = () =>
    save({
      variables: {
        input: {
          id: form.id ?? null,
          name: form.name,
          slug: form.slug,
          brand: form.brand || null,
          category: form.category || null,
          priceCents: Math.round(Number(form.price.replace(',', '.')) * 100),
          vatRate: Number(form.vatRate.replace(',', '.')),
          stock: Number.parseInt(form.stock, 10),
          maxPerOrder: Number.parseInt(form.maxPerOrder, 10),
          imageUrl: form.imageUrl || null,
          description: form.description || null,
          active: form.active,
          sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
        },
      },
    });

  const input = 'mt-0.5 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm';
  return (
    <div className="rounded-lg border border-brand-200 bg-white px-4 py-4 space-y-3">
      <p className="text-sm font-semibold text-gray-900">{form.id ? t('Edit product') : t('New product')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-600">{t('Name')}<input value={form.name} onChange={set('name')} className={input} /></label>
        <label className="text-xs text-gray-600">{t('Web address')} (/shop/…)<input value={form.slug} onChange={set('slug')} className={input} /></label>
        <label className="text-xs text-gray-600">{t('Brand')}<input value={form.brand} onChange={set('brand')} className={input} /></label>
        <label className="text-xs text-gray-600">{t('Category')}<input value={form.category} onChange={set('category')} className={input} /></label>
        <label className="text-xs text-gray-600">{t('Price (€, VAT included)')}<input value={form.price} onChange={set('price')} inputMode="decimal" className={input} /></label>
        <label className="text-xs text-gray-600">{t('VAT rate (%)')}<input value={form.vatRate} onChange={set('vatRate')} inputMode="decimal" className={input} /></label>
        <label className="text-xs text-gray-600">{t('Units in stock')}<input value={form.stock} onChange={set('stock')} inputMode="numeric" className={input} /></label>
        <label className="text-xs text-gray-600">{t('Most per order')}<input value={form.maxPerOrder} onChange={set('maxPerOrder')} inputMode="numeric" className={input} /></label>
        <label className="text-xs text-gray-600 sm:col-span-2">{t('Image address (https://…)')}<input value={form.imageUrl} onChange={set('imageUrl')} className={input} /></label>
        <label className="text-xs text-gray-600 sm:col-span-2">{t('Description (no health claims)')}<textarea value={form.description} onChange={set('description')} rows={4} className={input} /></label>
        <label className="text-xs text-gray-600">{t('Order on the page (lower first)')}<input value={form.sortOrder} onChange={set('sortOrder')} inputMode="numeric" className={input} /></label>
        <label className="flex items-center gap-2 text-sm text-gray-700 self-end"><input type="checkbox" checked={form.active} onChange={set('active')} />{t('On sale')}</label>
      </div>
      <InlineError error={error} />
      <div className="flex gap-2">
        <button type="button" disabled={loading} onClick={submit} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{loading ? t('Saving…') : t('Save')}</button>
        <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">{t('Cancel')}</button>
      </div>
    </div>
  );
}

/* ── Fiscal receipts ── */

function Receipts() {
  const { t, timeAgo } = useI18n();
  const { data, loading, error, refetch } = useQuery(PENDING_FISCAL_RECEIPTS, { fetchPolicy: 'cache-and-network' });
  const receipts: any[] = data?.pendingFiscalReceipts ?? [];
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<{ id: string; error: unknown } | null>(null);
  const [mark, { loading: saving }] = useMutation(MARK_FISCAL_RECEIPT_ISSUED, { refetchQueries: [PENDING_FISCAL_RECEIPTS, SHOP_ORDERS] });

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">{t('Each paid order needs a fiscal receipt, and each refund a correcting one. Issue it from the fiscal device or software, then enter its number here.')}</p>
      {error && <ErrorAlert error={error} onRetry={() => refetch()} />}
      {!loading && !error && receipts.length === 0 && <Empty>{t('No fiscal receipts owed.')}</Empty>}
      <ul className="space-y-2">
        {receipts.map((r) => (
          <li key={r.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${r.kind === 'REFUND' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>{r.kind === 'REFUND' ? t('Refund') : t('Sale')}</span>
            <span className="font-mono font-semibold">{r.orderReference}</span>
            <span className="text-gray-700">{r.buyerName}</span>
            <span className="font-medium">{money(r.kind === 'REFUND' ? -r.amountCents : r.amountCents, r.currency)}</span>
            <span className="text-xs text-gray-500">{timeAgo(r.createdAt)}</span>
            <span className="ml-auto flex items-center gap-2">
              <input value={numbers[r.id] ?? ''} onChange={(e) => setNumbers((n) => ({ ...n, [r.id]: e.target.value }))} placeholder={t('Receipt number')} className="w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
              <button type="button" disabled={saving || !(numbers[r.id] ?? '').trim()}
                onClick={() => mark({ variables: { id: r.id, receiptNumber: numbers[r.id] } }).then(() => setRowError(null), (e) => setRowError({ id: r.id, error: e }))}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {t('Mark issued')}
              </button>
            </span>
            {rowError && rowError.id === r.id && <InlineError error={rowError.error} size="xs" className="w-full" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
