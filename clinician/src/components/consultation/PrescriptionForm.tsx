'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLazyQuery, useQuery } from '@apollo/client';
import { PRODUCTS } from '@/graphql/catalog';
import { PRESCRIBING_CHECK } from '@/graphql/consultations';

type Strength = { id: string; label: string; packDescription?: string | null; titrationStep?: number | null; defaultQuantity: number };
type Product = {
  id: string; name: string; brandName?: string | null; category: string;
  requiresColdChain: boolean; defaultDirections?: string | null; strengths: Strength[];
};
export type Row = { productId: string; strengthId: string; quantity: number; directions: string };
type Violation = { code: string; message: string; overridable: boolean };

export type PrescriptionSubmission = {
  items: Row[];
  notes?: string;
  validityDays: number;
  refillsAllowed: number;
  overrideReason?: string;
};

const EMPTY_ROW: Row = { productId: '', strengthId: '', quantity: 1, directions: '' };
const VALIDITY_OPTIONS = [30, 90, 180, 365];
const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

const productLabel = (p: Product) => (p.brandName ? `${p.name} (${p.brandName})` : p.name);
const isComplete = (r: Row) => r.productId && r.strengthId && r.quantity > 0 && r.directions.trim();

export function PrescriptionForm({
  consultationId, kind, submitting, onSubmit, onCancel,
  submitLabel = 'Approve and issue prescription', initialItems, stepUp = false,
}: {
  consultationId: string;
  kind: 'HRT' | 'GLP1' | 'TRT';
  submitting: boolean;
  onSubmit: (input: PrescriptionSubmission) => void;
  onCancel: () => void;
  submitLabel?: string;
  // Start from the patient's current medicines (e.g. at a check-in)…
  initialItems?: Row[];
  // …moving titrated ones to the next step of their protocol.
  stepUp?: boolean;
}) {
  const { data, loading } = useQuery(PRODUCTS, { variables: { kind } });
  const products: Product[] = data?.products ?? [];

  const [rows, setRows] = useState<Row[]>([EMPTY_ROW]);
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || !products.length || !initialItems?.length) return;
    setSeeded(true);
    setRows(
      initialItems.map((row) => {
        const product = products.find((p) => p.id === row.productId);
        const current = product?.strengths.find((s) => s.id === row.strengthId);
        const next = stepUp && current?.titrationStep
          ? product!.strengths.find((s) => s.titrationStep === current.titrationStep! + 1)
          : undefined;
        return { ...row, strengthId: next?.id ?? row.strengthId };
      }),
    );
  }, [products, initialItems, stepUp, seeded]);
  const [notes, setNotes] = useState('');
  const [validityDays, setValidityDays] = useState(180);
  const [refillsAllowed, setRefillsAllowed] = useState(0);
  const [overrideReason, setOverrideReason] = useState('');

  const [runCheck, { data: checkData }] = useLazyQuery(PRESCRIBING_CHECK, { fetchPolicy: 'network-only' });
  const complete = rows.every(isComplete);
  const itemsKey = JSON.stringify(rows);

  // Re-run the server's prescribing rules as the prescription changes, so the
  // prescriber sees what approval would reject before submitting.
  useEffect(() => {
    if (!complete) return;
    const t = setTimeout(() => runCheck({ variables: { consultationId, items: rows } }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, complete, consultationId]);

  const violations: Violation[] = complete ? checkData?.prescribingCheck ?? [] : [];
  const blocking = violations.filter((v) => !v.overridable);
  const needsReason = violations.filter((v) => v.overridable);
  const canSubmit = complete && blocking.length === 0 && (needsReason.length === 0 || overrideReason.trim()) && !submitting;

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const chooseProduct = (i: number, productId: string) => {
    const product = productById.get(productId);
    if (!product) return update(i, EMPTY_ROW);
    // Titrated products start on step 1; the rules flag anything higher for a new patient.
    const start = product.strengths.find((s) => s.titrationStep === 1) ?? product.strengths[0];
    update(i, {
      productId,
      strengthId: start?.id ?? '',
      quantity: start?.defaultQuantity ?? 1,
      directions: product.defaultDirections ?? '',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      items: rows.map((r) => ({ ...r, directions: r.directions.trim() })),
      notes: notes.trim() || undefined,
      validityDays,
      refillsAllowed,
      overrideReason: needsReason.length ? overrideReason.trim() : undefined,
    });
  };

  if (loading) return <p className="text-sm text-gray-500">Loading medicines…</p>;
  if (!products.length) return <p className="text-sm text-danger-500">No {kind} medicines are available to prescribe. An admin needs to add them to the catalog.</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {rows.map((row, i) => {
        const product = productById.get(row.productId);
        const strength = product?.strengths.find((s) => s.id === row.strengthId);
        const chosenElsewhere = new Set(rows.filter((_, j) => j !== i).map((r) => r.productId));
        return (
          <div key={i} className="border border-gray-200 rounded p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Medicine {i + 1}</span>
              {rows.length > 1 && (
                <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-xs text-gray-400 hover:text-danger-500">
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-2 block">
                <span className="block text-xs font-medium text-gray-700 mb-1">Product</span>
                <select required value={row.productId} onChange={(e) => chooseProduct(i, e.target.value)} className={inputCls}>
                  <option value="">Select…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id} disabled={chosenElsewhere.has(p.id)}>{productLabel(p)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-700 mb-1">Strength</span>
                <select required value={row.strengthId} disabled={!product} onChange={(e) => update(i, { strengthId: e.target.value })} className={inputCls}>
                  {product?.strengths.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}{s.titrationStep ? ` — step ${s.titrationStep}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {strength?.packDescription && (
              <p className="text-xs text-gray-500">
                {strength.packDescription}
                {product?.requiresColdChain && ' · refrigerated, cold-chain delivery'}
              </p>
            )}
            <div className="grid grid-cols-4 gap-3">
              <label className="block">
                <span className="block text-xs font-medium text-gray-700 mb-1">Packs</span>
                <input type="number" min={1} max={12} required value={row.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} className={inputCls} />
              </label>
              <label className="col-span-3 block">
                <span className="block text-xs font-medium text-gray-700 mb-1">Directions (printed on the label)</span>
                <textarea rows={2} required value={row.directions} onChange={(e) => update(i, { directions: e.target.value })} className={inputCls} />
              </label>
            </div>
          </div>
        );
      })}

      {kind === 'HRT' && rows.length < products.length && (
        <button type="button" onClick={() => setRows((rs) => [...rs, EMPTY_ROW])} className="text-sm text-brand-500 hover:underline">
          + Add another medicine
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">Valid for</span>
          <select value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} className={inputCls}>
            {VALIDITY_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">Repeats</span>
          <input type="number" min={0} max={11} value={refillsAllowed} onChange={(e) => setRefillsAllowed(Number(e.target.value))} className={inputCls} />
        </label>
      </div>

      <label className="block">
        <span className="block text-xs font-medium text-gray-700 mb-1">Additional instructions (optional)</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
      </label>

      {blocking.length > 0 && (
        <div className="bg-danger-50 border border-danger-500 rounded p-3 space-y-1">
          {blocking.map((v) => <p key={v.code} className="text-sm text-danger-500">{v.message}</p>)}
        </div>
      )}

      {needsReason.length > 0 && (
        <div className="bg-warn-50 border border-warn-500 rounded p-3 space-y-2">
          {needsReason.map((v) => <p key={v.code} className="text-sm text-gray-800">{v.message}</p>)}
          <label className="block">
            <span className="block text-xs font-medium text-gray-700 mb-1">Clinical reason to proceed (recorded on the prescription)</span>
            <textarea rows={2} required value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className={inputCls} />
          </label>
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={!canSubmit} className="bg-green-600 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50">
          {submitting ? 'Issuing…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
      </div>
    </form>
  );
}
