'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { format } from 'date-fns';
import { CANCEL_MY_SUBSCRIPTION, MY_LAST_REFUND_DECISION, MY_OPEN_REFUND_REQUEST, MY_SUBSCRIPTION, REQUEST_MY_REFUND } from '@/graphql/billing';
import { MY_SUPPLY_STATUS, RESTART_TREATMENT } from '@/graphql/supply';
import { InlineError } from '@/components/common/Alert';

/**
 * Two separate asks, kept apart on purpose: stopping stops the next payment (nothing paid is returned); a refund
 * request is a question to the clinic, answered by a person who can see whether the medicine has already left the pharmacy.
 */
export function StopOrRefundCard() {
  const { data } = useQuery(MY_OPEN_REFUND_REQUEST);
  const [requestRefund, { loading: asking, error: askError }] = useMutation(REQUEST_MY_REFUND, { refetchQueries: [MY_OPEN_REFUND_REQUEST, MY_LAST_REFUND_DECISION] });
  const { data: subscription } = useQuery(MY_SUBSCRIPTION, { fetchPolicy: 'cache-and-network' });
  const [stop, { loading: stopping, error: stopError }] = useMutation(CANCEL_MY_SUBSCRIPTION, { refetchQueries: [MY_SUBSCRIPTION] });
  const { data: supply } = useQuery(MY_SUPPLY_STATUS, { fetchPolicy: 'cache-and-network' });
  const [restart, { loading: restarting, error: restartError }] = useMutation(RESTART_TREATMENT, { refetchQueries: [MY_SUPPLY_STATUS] });
  const lapsed = supply?.mySupplyStatus && !supply.mySupplyStatus.subscriptionActive;
  const [confirming, setConfirming] = useState<'stop' | 'refund' | null>(null);
  const [stopped, setStopped] = useState('');
  const open = data?.myOpenRefundRequest;
  const { data: decided } = useQuery(MY_LAST_REFUND_DECISION, { fetchPolicy: 'cache-and-network' });
  const decision = decided?.myLastRefundDecision;
  const sub = subscription?.mySubscription;
  // A refund that was approved: say so, and don't offer to ask again while nothing is running that could be refunded.
  const refunded = decision?.status === 'APPROVED' && (!sub || sub.endsAtPeriodEnd);
  const decisionText = !decision ? '' : decision.status === 'APPROVED'
    ? `Your refund was approved on ${format(new Date(decision.decidedAt), 'd MMM yyyy')}. It can take a few days to reach your card.`
    : `The clinic wasn’t able to refund your last request (${format(new Date(decision.decidedAt), 'd MMM yyyy')}). Message your care team if you have questions.`;
  // What Stripe says is shown first, so a reload remembers that it has been stopped.
  const endsOn = sub?.endsAtPeriodEnd ? (sub.endsAt ? `Your subscription ends on ${format(new Date(sub.endsAt), 'd MMM yyyy')}. No further payments are taken.` : 'Your subscription has been stopped. No further payments are taken.') : '';

  return (
    <div className="space-y-4 text-sm text-slate-600">
      {lapsed && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p className="font-medium text-slate-800">Your subscription has ended</p>
          <p className="mt-0.5">Want to carry on? Your doctor will ask for a short check-in and write a new prescription (the prescription fee applies again). After that you pay for each supply when it is ready, with no subscription.</p>
          <button type="button" disabled={restarting} onClick={() => restart().catch(() => undefined)} className="mt-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-60 rounded-lg px-3 py-1.5">{restarting ? 'Restarting…' : 'Restart my treatment'}</button>
          <InlineError error={restartError} size="xs" className="mt-1" />
        </div>
      )}
      <div>
        <p className="font-medium text-slate-800">Stop my subscription</p>
        <p className="mt-0.5">No further payments are taken after the period you have already paid for. Nothing you have paid is returned.</p>
        {endsOn || stopped ? (
          <p role="status" className="mt-2 text-emerald-700">{endsOn || stopped}</p>
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
        <p className="mt-0.5">You don’t need to give a reason. The clinic looks at where your order is and replies; nothing is refunded until it does. If a prescription has already been written for you, the refund does not include the prescription fee, because the doctor’s work cannot be undone. Everything else is returned. If you refund before receiving anything, your account is closed, and you can still buy the same medicine within 15 days of the prescription without paying the fee again; we email you the link.</p>
        {decisionText && !open && <p role="status" className={`mt-2 ${decision.status === 'APPROVED' ? 'text-emerald-700' : 'text-slate-700'}`}>{decisionText}</p>}
        {open ? (
          open.status === 'AWAITING_RETURN' ? (
            <p role="status" className="mt-2 text-amber-800">We’re refunding you as soon as your parcel is back with us. Please don’t open it: refuse the delivery, or keep it sealed and message us.</p>
          ) : (
            <p role="status" className="mt-2 text-slate-700">Your request is with the clinic. We’ll be in touch.</p>
          )
        ) : refunded ? null : confirming === 'refund' ? (
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
