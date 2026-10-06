'use client';

import { useState } from 'react';
import type { ProofCheck } from './ProofReview';
import { DETAIL_INFO, DetailChip, DetailInfo, useSpotlight } from './DetailChip';

type Field = ProofCheck['key'];

const FIELDS: { key: Field; n: number; short: string }[] = [
  { key: 'NAME', n: 1, short: 'Name' },
  { key: 'MEDICINE', n: 2, short: 'Medicine' },
  { key: 'DOSE', n: 3, short: 'Dose' },
  { key: 'DATE', n: 4, short: 'Date' },
];

/**
 * An illustrated example of the chosen kind of proof, with the four details the check reads
 * highlighted and numbered. Details that didn't match on the last upload are highlighted amber.
 * Drawn in HTML (not a photo), with made-up details.
 */
export function ProofSample({ type, flagged = [] }: { type: string; flagged?: Field[] }) {
  const [openField, setOpenField] = useState<Field | null>(null);
  const [lastField, setLastField] = useState<Field | null>(null);
  const last = FIELDS.find((f) => f.key === lastField);
  // The outlines take turns: each detail in order grows and pulses for a moment.
  const focusedKey = useSpotlight(
    FIELDS.map((f) => f.key),
    openField,
    type,
  );
  const n = (key: Field) => FIELDS.find((f) => f.key === key)!.n;
  const Mark = ({ field, children }: { field: Field; children: React.ReactNode }) => {
    const warn = flagged.includes(field);
    const focused = focusedKey === field;
    return (
      <span
        className={`relative inline-block rounded px-1.5 py-0.5 -mx-0.5 transition-[opacity,box-shadow] duration-500 ${
          warn ? 'bg-amber-100 ring-amber-400' : 'bg-brand-50 ring-brand-400'
        } ${
          focused
            ? `z-10 ring-[3px] animate-[proof-pulse_1.4s_ease-in-out_infinite] ${
                warn ? 'shadow-[0_0_14px_3px_rgba(251,191,36,0.5)]' : 'shadow-[0_0_14px_3px_rgba(20,184,166,0.45)]'
              }`
            : 'ring-2 opacity-70'
        }`}
      >
        {children}
        <span
          className={`absolute -top-2.5 -right-2.5 w-4 h-4 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${
            warn ? 'bg-amber-500' : 'bg-brand-600'
          }`}
          aria-hidden
        >
          {n(field)}
        </span>
      </span>
    );
  };

  return (
    <figure className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
      <figcaption className="text-xs font-semibold text-slate-500">Example — what we need to see</figcaption>

      <div className="mt-2 rounded-xl bg-slate-50 p-2.5" aria-hidden>
        {type === 'PRESCRIPTION_DOCUMENT' ? (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 text-[13px] text-slate-700 space-y-2.5">
            <div className="flex justify-between text-[11px] text-slate-400 uppercase tracking-wide">
              <span>Prescription</span>
              <span>Example Medical Practice</span>
            </div>
            <p>Patient: <Mark field="NAME">Jane Example</Mark></p>
            <p>Date issued: <Mark field="DATE">12/09/2026</Mark></p>
            <p className="pt-1">
              <span className="font-semibold"><Mark field="MEDICINE">Mounjaro</Mark></span> <Mark field="DOSE">5 mg</Mark> KwikPen
            </p>
            <p className="text-slate-500">Inject once weekly as directed. Supply: 1 pen (4 doses)</p>
            <p className="text-[11px] text-slate-400 pt-1">Prescriber: Dr A. Example</p>
          </div>
        ) : type === 'PHARMACY_RECORD' ? (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 text-[13px] text-slate-700">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Medication history</p>
            <p className="mt-1.5">Patient: <Mark field="NAME">Jane Example</Mark></p>
            <table className="w-full mt-3 text-left">
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2 pr-2"><Mark field="DATE">12/09/26</Mark></td>
                  <td className="py-2 pr-2"><Mark field="MEDICINE">Mounjaro</Mark></td>
                  <td className="py-2"><Mark field="DOSE">5 mg</Mark></td>
                </tr>
                <tr className="text-slate-400">
                  <td className="py-2 pr-2">14/08/26</td>
                  <td className="py-2 pr-2">Mounjaro</td>
                  <td className="py-2">2.5 mg</td>
                </tr>
              </tbody>
            </table>
            <p className="text-[11px] text-slate-400 mt-2">The most recent entry is the one we use.</p>
          </div>
        ) : type === 'ORDER_CONFIRMATION' ? (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 text-[13px] text-slate-700 space-y-2.5">
            <p className="font-semibold text-slate-900">Your order is confirmed</p>
            <p>Hi <Mark field="NAME">Jane Example</Mark>,</p>
            <p>Order date: <Mark field="DATE">12/09/2026</Mark></p>
            <div className="flex justify-between border-t border-slate-100 pt-2.5">
              <span><Mark field="MEDICINE">Mounjaro</Mark> <Mark field="DOSE">5 mg</Mark> KwikPen</span>
              <span className="text-slate-400">× 1</span>
            </div>
          </div>
        ) : (
          // Medicine box label: the pharmacy sticker
          <div className="bg-white rounded-md border-2 border-dashed border-slate-300 p-3.5 font-mono text-[12.5px] leading-relaxed text-slate-800 space-y-1.5">
            <p className="font-bold">
              <Mark field="MEDICINE">MOUNJARO</Mark> <Mark field="DOSE">5MG</Mark>/0.6ML KWIKPEN
            </p>
            <p className="text-slate-500">INJECT ONCE WEEKLY AS DIRECTED</p>
            <div className="flex justify-between pt-1">
              <Mark field="NAME">JANE EXAMPLE</Mark>
              <span className="text-slate-500">QTY: 1</span>
            </div>
            <p>
              DISPENSED: <Mark field="DATE">12/09/2026</Mark>
            </p>
            <p className="text-[10.5px] text-slate-400 pt-1">EXAMPLE PHARMACY · 1 HIGH STREET</p>
          </div>
        )}
      </div>

      <ul className="mt-2 flex flex-wrap justify-center gap-1.5">
        {FIELDS.map((f) => (
          <DetailChip
            key={f.key}
            n={f.n}
            label={f.short}
            state={flagged.includes(f.key) ? 'flagged' : 'shown'}
            open={openField === f.key}
            highlighted={focusedKey === f.key}
            onOpenChange={(open) => {
              if (open) setLastField(f.key);
              setOpenField((current) => (open ? f.key : current === f.key ? null : current));
            }}
          />
        ))}
      </ul>
      <DetailInfo
        idle="Tap a number to see what each one means."
        open={openField !== null}
        info={
          last && (
            <>
              <span className="font-semibold">
                {last.n} {last.short}
              </span>{' '}
              — {DETAIL_INFO[last.key]}
            </>
          )
        }
      />
    </figure>
  );
}
