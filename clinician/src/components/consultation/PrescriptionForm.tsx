'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLazyQuery, useQuery } from '@apollo/client';
import { PRESCRIPTION_TEMPLATES, PRODUCTS } from '@/graphql/catalog';
import { PRESCRIBING_CHECK, PRESCRIBING_CONTEXT } from '@/graphql/consultations';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { Select } from '@/components/ui/Select';
import { NumberStepper } from '@/components/ui/NumberStepper';

type Strength = { id: string; label: string; packDescription?: string | null; titrationStep?: number | null; defaultQuantity: number };
type Product = {
  id: string; name: string; brandName?: string | null; category: string;
  requiresColdChain: boolean; defaultDirections?: string | null; strengths: Strength[];
};
export type Row = { productId: string; strengthId: string; quantity: number; directions: string };
type Violation = { code: string; message: string; overridable: boolean };
type Template = {
  id: string; name: string; description: string; validityDays: number; refillsAllowed: number; notes?: string | null;
  items: Row[];
};

export type PrescriptionSubmission = {
  items: Row[];
  notes?: string;
  validityDays: number;
  refillsAllowed: number;
  overrideReason?: string;
};

// `locked` is only for this form: a medicine the patient paid for stays as bought until a doctor unlocks it.
type FormRow = Row & { locked?: boolean };
// What goes to the server: never the form's own flags.
const plain = (r: FormRow): Row => ({ productId: r.productId, strengthId: r.strengthId, quantity: r.quantity, directions: r.directions });

const EMPTY_ROW: Row = { productId: '', strengthId: '', quantity: 1, directions: '' };
const VALIDITY_OPTIONS = [30, 90, 180, 365];
// One look for every control: same height, border, radius and focus ring (textareas just grow).
const controlCls =
  'w-full border border-gray-200 rounded-lg bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:hover:border-gray-200';
// Selects keep clear of the browser's chevron so a long label ("100 micrograms/24 h") isn't clipped.
const inputCls = `${controlCls} h-10 pr-9`;
const textareaCls = `${controlCls} py-2.5 leading-relaxed resize-y min-h-[5rem]`;
const labelCls = 'block text-xs font-medium text-gray-600 mb-1.5';

const productLabel = (p: Product) => (p.brandName ? `${p.name} (${p.brandName})` : p.name);
const isComplete = (r: Row) => r.productId && r.strengthId && r.quantity > 0 && r.directions.trim();

export function PrescriptionForm({
  consultationId, kind, submitting, onSubmit, onCancel,
  submitLabel = 'Approve and issue prescription', initialItems, stepUp = false, showDoseContext = false, error = '',
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
  // A consultation's first prescription: show the dose paid for and what the proof showed.
  showDoseContext?: boolean;
  // Why the last submit failed, shown right above the buttons where it can't be missed.
  error?: string;
}) {
  const { t } = useI18n();
  const { data, loading } = useQuery(PRODUCTS, { variables: { kind } });
  const { data: contextData } = useQuery(PRESCRIBING_CONTEXT, {
    variables: { consultationId },
    skip: !showDoseContext,
  });
  const doseContext = contextData?.prescribingContext;
  const products: Product[] = data?.products ?? [];

  // One-click starting points (e.g. the 4-week semaglutide starter pack); not offered when
  // continuing a patient's current medicines at a check-in.
  const { data: templateData } = useQuery(PRESCRIPTION_TEMPLATES, { variables: { kind }, skip: !!initialItems?.length });
  const templates: Template[] = templateData?.prescriptionTemplates ?? [];
  const [templateId, setTemplateId] = useState<string | null>(null);

  const [rows, setRows] = useState<FormRow[]>([EMPTY_ROW]);
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
  // A first prescription starts on what the patient paid for (still editable); a template or a manual pick replaces it.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || initialItems?.length || !products.length || !doseContext?.orderedProductId) return;
    setPrefilled(true);
    const rowFor = (productId?: string | null, strengthId?: string | null): FormRow | null => {
      const product = products.find((p) => p.id === productId);
      const strength = product?.strengths.find((s) => s.id === strengthId);
      return product && strength
        ? { productId: product.id, strengthId: strength.id, quantity: strength.defaultQuantity ?? 1, directions: product.defaultDirections ?? '', locked: true }
        : null;
    };
    // The medicine bought, plus the progesterone when that was added to an HRT order.
    const prefill = [
      rowFor(doseContext.orderedProductId, doseContext.orderedStrengthId),
      rowFor(doseContext.orderedProgesteroneProductId, doseContext.orderedProgesteroneStrengthId),
    ].filter((r): r is FormRow => !!r);
    if (!prefill.length) return;
    setRows((rs) => (rs.length === 1 && !rs[0].productId ? prefill : rs));
  }, [prefilled, initialItems, products, doseContext]);
  const [notes, setNotes] = useState('');
  const [validityDays, setValidityDays] = useState(180);
  const [refillsAllowed, setRefillsAllowed] = useState(0);
  const [overrideReason, setOverrideReason] = useState('');

  const [runCheck, { data: checkData }] = useLazyQuery(PRESCRIBING_CHECK, { fetchPolicy: 'network-only' });
  const complete = rows.every(isComplete);
  const itemsKey = JSON.stringify(rows.map(plain));

  // Re-run the server's prescribing rules as the prescription changes, so the
  // prescriber sees what approval would reject before submitting.
  useEffect(() => {
    if (!complete) return;
    const t = setTimeout(() => runCheck({ variables: { consultationId, items: rows.map(plain) } }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, complete, consultationId]);

  const violations: Violation[] = complete ? checkData?.prescribingCheck ?? [] : [];
  const blocking = violations.filter((v) => !v.overridable);
  const needsReason = violations.filter((v) => v.overridable);
  const canSubmit = complete && blocking.length === 0 && (needsReason.length === 0 || overrideReason.trim()) && !submitting;

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const update = (i: number, patch: Partial<FormRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

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

  // Fills in medicines, doses, directions, validity and repeats; everything stays editable.
  const applyTemplate = (tpl: Template) => {
    setTemplateId(tpl.id);
    setRows(tpl.items.map((i) => ({ productId: i.productId, strengthId: i.strengthId, quantity: i.quantity, directions: i.directions })));
    setValidityDays(tpl.validityDays);
    setRefillsAllowed(tpl.refillsAllowed);
    setNotes(tpl.notes ?? '');
    setOverrideReason('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      items: rows.map((r) => ({ ...plain(r), directions: r.directions.trim() })),
      notes: notes.trim() || undefined,
      validityDays,
      refillsAllowed,
      overrideReason: needsReason.length ? overrideReason.trim() : undefined,
    });
  };

  if (loading) return <p className="text-sm text-gray-500">{t('Loading medicines…')}</p>;
  if (!products.length) return <p className="text-sm text-danger-500">{t('No {kind} medicines are available to prescribe. An admin needs to add them to the catalog.', { kind })}</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {kind === 'GLP1' && doseContext && !doseContext.hasActivePrescription && <DoseContext context={doseContext} />}

      {rows.map((row, i) => {
        const product = productById.get(row.productId);
        const strength = product?.strengths.find((s) => s.id === row.strengthId);
        const chosenElsewhere = new Set(rows.filter((_, j) => j !== i).map((r) => r.productId));
        return (
          <div key={i} className="border border-gray-200 rounded-xl bg-gray-50 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t('Medicine {n}', { n: i + 1 })}</span>
                {row.locked && <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">{t('Paid for')}</span>}
              </div>
              {rows.length > 1 && !row.locked && (
                <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-xs text-gray-400 hover:text-danger-500">
                  {t('Remove')}
                </button>
              )}
            </div>

            {row.locked && product && strength ? (
              <div>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{productLabel(product)}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{strength.label}</p>
                  </div>
                  <button type="button" onClick={() => update(i, { locked: false })} className="shrink-0 text-sm font-medium text-brand-500 hover:underline">
                    {t('Change')}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-gray-400">{t('The patient paid for exactly this, so changing it changes what they are billed.')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_15rem] gap-3">
                <div className="block">
                  <span className={labelCls}>{t('Product')}</span>
                  <Select
                    ariaLabel={t('Product')}
                    value={row.productId}
                    onChange={(v) => chooseProduct(i, v)}
                    placeholder={t('Select…')}
                    options={products.map((p) => ({ value: p.id, label: productLabel(p), disabled: chosenElsewhere.has(p.id) }))}
                  />
                </div>
                <div className="block">
                  <span className={labelCls}>{t('Strength')}</span>
                  <Select
                    ariaLabel={t('Strength')}
                    value={row.strengthId}
                    disabled={!product}
                    onChange={(v) => update(i, { strengthId: v })}
                    placeholder=""
                    options={(product?.strengths ?? []).map((st) => ({ value: st.id, label: `${st.label}${st.titrationStep ? ` — step ${st.titrationStep}` : ''}` }))}
                  />
                </div>
              </div>
            )}

            <div className="flex items-end gap-4">
              <div>
                <span className={labelCls}>{t('Packs')}</span>
                <NumberStepper ariaLabel={t('Packs')} className="w-36" min={1} max={12} emptyValue={0} placeholder="1" value={row.quantity} onChange={(n) => update(i, { quantity: n })} />
              </div>
              {strength?.packDescription && (
                <p className="pb-2.5 text-sm text-gray-500">
                  {t('Each pack')}: {strength.packDescription}
                  {product?.requiresColdChain && ` · ${t('refrigerated, cold-chain delivery')}`}
                </p>
              )}
            </div>

            <label className="block">
              <span className={labelCls}>{t('Directions (printed on the label)')}</span>
              <textarea rows={2} required value={row.directions} onChange={(e) => update(i, { directions: e.target.value })} className={textareaCls} />
            </label>
          </div>
        );
      })}

      {kind === 'HRT' && rows.length < products.length && (
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, EMPTY_ROW])}
          className="w-full border border-dashed border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-500 hover:border-brand-500 hover:text-brand-500 transition-colors"
        >
          {t('+ Add another medicine')}
        </button>
      )}

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="block">
            <span className={labelCls}>{t('Valid for')}</span>
            <Select
              ariaLabel={t('Valid for')}
              value={String(validityDays)}
              onChange={(v) => setValidityDays(Number(v))}
              options={VALIDITY_OPTIONS.map((d) => ({ value: String(d), label: t('{n} days', { n: d }) }))}
            />
            <span className="block text-xs text-gray-400 mt-1">{t('How long it can be dispensed')}</span>
          </div>
          <div className="block">
            <span className={labelCls}>{t('Repeats')}</span>
            <NumberStepper ariaLabel={t('Repeats')} min={0} max={11} emptyValue={0} placeholder="0" value={refillsAllowed} onChange={setRefillsAllowed} />
            <span className="block text-xs text-gray-400 mt-1">{t('Extra supplies after the first')}</span>
          </div>
        </div>

        <label className="block">
          <span className={labelCls}>{t('Additional instructions (optional)')}</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls} />
        </label>
      </div>

      {blocking.length > 0 && (
        <div className="bg-danger-50 border border-danger-500 rounded p-3 space-y-1">
          {blocking.map((v) => <p key={v.code} className="text-sm text-danger-500">{v.message}</p>)}
        </div>
      )}

      {needsReason.length > 0 && (
        <div className="bg-warn-50 border border-warn-500 rounded p-3 space-y-2">
          {needsReason.map((v) => <p key={v.code} className="text-sm text-gray-800">{v.message}</p>)}
          <label className="block">
            <span className={labelCls}>{t('Clinical reason to proceed (recorded on the prescription)')}</span>
            <textarea rows={2} required value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className={textareaCls} />
          </label>
        </div>
      )}

      {templates.length > 0 && (
        <div className="block border-t border-gray-100 pt-4">
          <span className={labelCls}>{t('Start from a template')}</span>
          <Select
            ariaLabel={t('Start from a template')}
            value={templateId ?? ''}
            onChange={(v) => {
              const tpl = templates.find((x) => x.id === v);
              if (tpl) applyTemplate(tpl);
            }}
            placeholder={t('Choose a template…')}
            options={templates.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
          />
          <span className="block text-xs text-gray-400 mt-1">
            {templates.find((x) => x.id === templateId)?.description ?? t('Fills in the medicines, validity and repeats above; you can still edit them.')}
          </span>
        </div>
      )}

      {error && (
        <div role="alert" className="bg-danger-50 border border-danger-500 rounded-lg p-3 text-sm text-danger-500">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
        <button type="submit" disabled={!canSubmit} className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-5 h-10 text-sm font-medium disabled:opacity-50 transition-colors">
          {submitting ? t('Issuing…') : t(submitLabel)}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-4 h-10">{t('Cancel')}</button>
      </div>
    </form>
  );
}

const RISK_CLS: Record<string, string> = {
  OK: 'text-green-700',
  UNVERIFIED: 'text-gray-600',
  CAUTION: 'text-amber-700',
  HIGH: 'text-red-700',
};

/**
 * One line of what matters for a first GLP-1 dose: what the patient paid for (a first prescription
 * can't be a more expensive dose), what their prescription proof showed, and the safe next dose.
 */
function DoseContext({
  context,
}: {
  context: {
    orderedTreatment?: string | null;
    priorMedicationUse?: boolean | null;
    noProof: boolean;
    proofDose?: string | null;
    proofRiskLevel?: string | null;
    safeNextDose?: string | null;
  };
}) {
  const { t } = useI18n();
  const proof = context.noProof
    ? t('Used before, no proof — start dose')
    : context.priorMedicationUse === false
      ? t('First time on this medicine — start dose')
      : context.proofDose
        ? t('Shows {dose}', { dose: context.proofDose })
        : context.priorMedicationUse
          ? t('Not read automatically — check the document')
          : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs grid grid-cols-3 gap-3">
      <div>
        <p className="text-gray-500">{t('Paid for')}</p>
        <p className="font-medium text-gray-900 mt-0.5">{context.orderedTreatment ?? '—'}</p>
        {context.orderedTreatment && <p className="text-gray-400 mt-0.5">{t('No higher dose on a first prescription')}</p>}
      </div>
      <div>
        <p className="text-gray-500">{t('Prescription proof')}</p>
        <p className="font-medium text-gray-900 mt-0.5">{proof ?? '—'}</p>
      </div>
      <div>
        <p className="text-gray-500">{t('Safe next dose')}</p>
        <p className={`font-semibold mt-0.5 ${RISK_CLS[context.proofRiskLevel ?? ''] ?? 'text-gray-900'}`}>
          {context.safeNextDose ?? (context.noProof || context.priorMedicationUse === false ? t('Starting dose') : '—')}
        </p>
      </div>
    </div>
  );
}

