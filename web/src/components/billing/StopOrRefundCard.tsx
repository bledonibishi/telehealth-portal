'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { CANCEL_MY_SUBSCRIPTION, MY_OPEN_REFUND_REQUEST, REQUEST_MY_REFUND } from '@/graphql/billing';
import { InlineError } from '@/components/common/Alert';

/**
 * Two separate asks, kept apart on purpose: stopping stops the next payment (nothing paid is returned); a refund
 * request is a question to the clinic, answered by a person who can see whether the medicine has already left the pharmacy.
 */
export function StopOrRefundCard() {
  const { data } = useQuery(MY_OPEN_REFUND_REQUEST);
  const [requestRefund, { loading: asking, error: askError }] = useMutation(REQUEST_MY_REFUND, { refetchQueries: [MY_OPEN_REFUND_REQUEST] });
  const [stop, { loading: stopping, error: stopError }] = useMutation(CANCEL_MY_SUBSCRIPTION);
  const [confirming, setConfirming] = useState<'stop' | 'refund' | null>(null);
  const [stopped, setStopped] = useState('');
  const open = data?.myOpenRefundRequest;

  return (
    <div className="space-y-4 text-sm text-slate-600">
      <div>
        <p className="font-medium text-slate-800">Stop my subscription</p>
        <p className="mt-0.5">No further payments are taken after the period you have already paid for. Nothing you have paid is returned.</p>
        {stopped ? (
          <p role="status" className="mt-2 text-emerald-700">{stopped}</p>
        ) : confirming === 'stop' ? (
          <div className="mt-2 flex items-center gap-3">
            <button type="button" disabled={stopping} onClick={async () => { try { const r = await stop(); setStopped(r.data?.cancelMySubscription ?? 'Done'); setConfirming(null); } catch { /* shown below */ } }}
              className="text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-60 rounded-lg px-3 py-1.5">{stopping ? 'Stopping…' : 'Yes, stop it'}</button>
            <button type="button" onClick={() => setConfirming(null)} className="text-xs text-slate-500 hover:text-slate-800">Keep it</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming('stop')} className="mt-2 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg px-3 py-1.5">Stop my subscription</button>
        )}
        <InlineError error={stopError} size="xs" className="mt-1" />
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="font-medium text-slate-800">Ask for a refund</p>
        <p className="mt-0.5">You don’t need to give a reason. The clinic looks at where your order is and replies; nothing is refunded until it does.</p>
        {open ? (
          <p role="status" className="mt-2 text-slate-700">Your request is with the clinic. We’ll be in touch.</p>
        ) : confirming === 'refund' ? (
          <div className="mt-2 flex items-center gap-3">
            <button type="button" disabled={asking} onClick={async () => { try { await requestRefund(); setConfirming(null); } catch { /* shown below */ } }}
              className="text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-60 rounded-lg px-3 py-1.5">{asking ? 'Sending…' : 'Send request'}</button>
            <button type="button" onClick={() => setConfirming(null)} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming('refund')} className="mt-2 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg px-3 py-1.5">Ask for a refund</button>
        )}
        <InlineError error={askError} size="xs" className="mt-1" />
      </div>
    </div>
  );
}
