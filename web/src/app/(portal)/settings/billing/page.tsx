'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { ME_BILLING } from '@/graphql/patient';
import { ManageSubscriptionButton } from '@/components/billing/ManageSubscriptionCard';
import { PaymentsCard } from '@/components/billing/PaymentsCard';
import { StopOrRefundCard } from '@/components/billing/StopOrRefundCard';
import { VoucherAutoApplyToggle } from '@/components/portal/VoucherAutoApplyToggle';
import { Card, CardHeader } from '@/components/portal/Card';
import { SettingsSubpage } from '@/components/portal/SettingsMenu';

export default function BillingPage() {
  const { data: billing } = useQuery(ME_BILLING, { fetchPolicy: 'cache-and-network' });
  const paysPerSupply: boolean = !!billing?.me?.paysPerSupply;
  return (
    <SettingsSubpage title="Billing & payments" subtitle="Your subscription, payments, refunds and vouchers.">
      <Card>
        {paysPerSupply ? (
          <>
            <CardHeader title="Subscription & billing" subtitle="You pay for each supply when your doctor approves it." />
            <p className="text-sm text-slate-600">Nothing renews by itself and nothing is charged to your card automatically, so there is nothing to cancel. Your invoices are below.</p>
            <p className="mt-3 text-sm text-slate-600">Want 10% off every month? <Link href="/messages" className="font-semibold text-ink-700 underline">Message your care team</Link> and we’ll set up a subscription for you.</p>
          </>
        ) : (
          <>
            <CardHeader title="Subscription & billing" subtitle="Update your card, see invoices, pause or cancel." />
            <div className="flex"><ManageSubscriptionButton /></div>
          </>
        )}
      </Card>

      <PaymentsCard />

      <Card>
        <CardHeader title="Stop or refund" subtitle="Stop future payments, or ask the clinic for your money back." />
        <StopOrRefundCard />
      </Card>

      <Card>
        <CardHeader title="Vouchers" subtitle="Rewards you earn when a friend you refer joins." />
        <VoucherAutoApplyToggle />
      </Card>
    </SettingsSubpage>
  );
}
