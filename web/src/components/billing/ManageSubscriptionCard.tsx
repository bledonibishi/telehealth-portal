'use client';

import { useMutation } from '@apollo/client';
import { CREATE_BILLING_PORTAL_SESSION } from '@/graphql/billing';
import { InlineError } from '@/components/common/Alert';

/** A small button that sends the patient to Stripe's customer portal: update the card, see invoices, manage or cancel. */
export function ManageSubscriptionButton() {
  const [openPortal, { loading, error }] = useMutation(CREATE_BILLING_PORTAL_SESSION);

  const manage = async () => {
    try {
      const { data } = await openPortal();
      // The link is single-use and short-lived, so go straight there.
      if (data?.createBillingPortalSession?.url) window.location.assign(data.createBillingPortalSession.url);
    } catch {
      /* shown from `error` */
    }
  };

  return (
    <div className="text-right">
      <button type="button" onClick={manage} disabled={loading} title="Update your card, see invoices, or pause or cancel"
        className="text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-60 rounded-lg px-3 py-1.5">
        {loading ? 'Opening…' : '💳 Manage subscription'}
      </button>
      <InlineError error={error} size="xs" className="mt-1 max-w-xs" />
    </div>
  );
}
