'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import { CREATE_REPEAT_ORDER, NEXT_SHIPMENT_ALERTS } from '@/graphql/orders';
import { hasAccess } from '@/lib/role';
import { useI18n } from '@/lib/i18n/I18nProvider';

const URGENCY: Record<string, { label: string; cls: string }> = {
  OVERDUE: { label: 'Overdue', cls: 'bg-red-50 text-red-700' },
  DUE: { label: 'Due now', cls: 'bg-amber-50 text-amber-700' },
  UPCOMING: { label: 'Coming up', cls: 'bg-blue-50 text-blue-700' },
};

const BLOCKER: Record<string, { text: string; cls: string }> = {
  NONE: { text: 'Ready — nothing is holding it up', cls: 'text-green-700' },
  AWAITING_CHECKIN: { text: 'Waiting for the patient’s monthly check-in', cls: 'text-amber-700' },
  AWAITING_REVIEW: { text: 'Check-in done — waiting for a doctor’s review', cls: 'text-amber-700' },
  NO_REPEATS_LEFT: { text: 'No repeats left — needs a new prescription', cls: 'text-red-700' },
};

/**
 * Patients whose next supply is close or late, so the next order reaches the pharmacy partner before
 * their treatment runs out — and, when it's held up, whose move it is.
 */
export default function NextShipments() {
  const { t, fmt } = useI18n();
  const { data, loading, error } = useQuery(NEXT_SHIPMENT_ALERTS, { pollInterval: 60_000 });
  const [errorFor, setErrorFor] = useState<{ id: string; message: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const [create, { loading: creating }] = useMutation(CREATE_REPEAT_ORDER, {
    // The orders list is fulfilment-only (doctors can't read it), so it is refreshed by name where it is open,
    // and the Orders page re-checks whenever it is opened.
    refetchQueries: [{ query: NEXT_SHIPMENT_ALERTS }, 'GetOrders'],
    onError: (e) => setErrorFor({ id: pendingRef.current ?? '', message: e.message }),
    onCompleted: () => setErrorFor(null),
  });
  const order = (prescriptionId: string) => {
    pendingRef.current = prescriptionId;
    setPendingId(prescriptionId);
    setErrorFor(null);
    create({ variables: { prescriptionId } });
  };

  // Placing a repeat is a prescriber's decision (it releases another supply of the medicine).
  const canOrder = hasAccess(['ADMIN', 'DOCTOR']);
  const canReview = hasAccess(['ADMIN', 'DOCTOR']);
  const alerts: any[] = data?.nextShipmentAlerts ?? [];

  const dueText = (days: number) =>
    days > 1 ? t('Due in {n} days', { n: days }) : days === 1 ? t('Due tomorrow') : days === 0 ? t('Due today') : days === -1 ? t('1 day late') : t('{n} days late', { n: -days });

  return (
    <div>
      <p className="px-6 py-3 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
        {t('Patients whose next supply is coming up or late. Once the order is placed it is passed to the pharmacy partner.')}
      </p>
      {loading && <p className="p-6 text-sm text-gray-400">{t('Loading…')}</p>}
      {error && <p className="p-6 text-sm text-red-500">{error.message}</p>}
      {!loading && alerts.length === 0 && <div className="p-12 text-center text-gray-400 text-sm">{t('No shipments are due soon.')}</div>}

      <ul className="divide-y divide-gray-100">
        {alerts.map((a) => {
          const urgency = URGENCY[a.urgency];
          const blocker = BLOCKER[a.blocker];
          const thisError = errorFor && errorFor.id === a.prescriptionId ? errorFor.message : null;
          return (
            <li key={a.prescriptionId} className="px-6 py-4 bg-white hover:bg-gray-50 flex flex-wrap items-start gap-x-6 gap-y-2">
              <div className="min-w-[220px] flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/patients?patient=${a.patientId}`} className="font-medium text-gray-900 hover:underline">{a.patientName}</Link>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${urgency.cls}`}>{t(urgency.label)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{a.medication}</p>
                {a.refillRequestedAt && (
                  <p className="text-xs mt-1.5 font-medium text-brand-700">✓ {t('Patient asked for this supply on {date}', { date: fmt(a.refillRequestedAt, 'dd MMM yyyy') })}</p>
                )}
                <p className={`text-xs mt-1.5 font-medium ${blocker.cls}`}>{t(blocker.text)}</p>
                {thisError && <p className="text-xs text-red-600 mt-1">{thisError}</p>}
              </div>

              <div className="text-xs text-gray-500 min-w-[180px]">
                <p className="font-medium text-gray-800">{dueText(a.daysUntilDue)}</p>
                <p>{t('Next supply on {date}', { date: fmt(a.nextDueAt, 'dd MMM yyyy') })}</p>
                <p>{t('Last shipped {date}', { date: fmt(a.lastShippedAt, 'dd MMM yyyy') })}</p>
                <p>{t('{n} repeats left', { n: a.repeatsLeft })}</p>
              </div>

              <div className="flex items-center gap-3 text-sm ml-auto">
                {a.blocker === 'AWAITING_REVIEW' && canReview && (
                  <Link href="/check-ins" className="text-brand-500 hover:text-brand-900">{t('Review check-ins')}</Link>
                )}
                {a.blocker === 'NONE' && canOrder && (
                  <button
                    onClick={() => order(a.prescriptionId)}
                    disabled={creating}
                    className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
                  >
                    {creating && pendingId === a.prescriptionId ? t('Creating…') : t('Create order')}
                  </button>
                )}
                <Link href={`/patients?patient=${a.patientId}`} className="text-brand-500 hover:text-brand-900">{t('Open patient')}</Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
