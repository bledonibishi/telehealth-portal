'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { MY_CONSULTATIONS } from '@/graphql/consultations';
import { ME_NAME } from '@/graphql/patient';
import { MY_WEIGHT_JOURNEY } from '@/graphql/weight';
import { MY_TREATMENT_PLAN } from '@/graphql/portal';
import { SubscriptionStatus } from '@/components/dashboard/SubscriptionStatus';
import { ReportSideEffectDialog } from '@/components/doses/ReportSideEffectDialog';
import { PlanHero } from '@/components/home/PlanHero';
import { ProgressOverview } from '@/components/home/ProgressOverview';
import { WeightTrendNotice } from '@/components/weight/WeightTrendNotice';
import { ProfileSummaryCard } from '@/components/home/ProfileSummaryCard';
import { TreatmentPlanCard } from '@/components/home/TreatmentPlanCard';
import { AppointmentCard, ChatCard, ContactCard, EmergencyCard } from '@/components/home/SideCards';
import { RecentUpdates } from '@/components/home/RecentUpdates';
import { RecentOrders } from '@/components/home/RecentOrders';
import { QuickLinks } from '@/components/home/QuickLinks';
import { Card, btnPrimary } from '@/components/portal/Card';
import { useCareStage } from '@/lib/useCareStage';
import { Icon } from '@/components/portal/Icon';
import { DASHBOARD_WIDGETS, sizeOf } from '@telehealth/shared-types';
import { useDashboardLayout } from '@/lib/useDashboardLayout';
import { CustomizeSlot } from '@/components/dashboard/CustomizeSlot';
import { InlineError } from '@/components/common/Alert';
import { SkeletonCard, SkeletonTile } from '@telehealth/loading';

/** One line that needs the patient's attention, with the action beside it. */
function Notice({ tone, title, text, href, action }: { tone: 'warn' | 'info'; title: string; text: string; href: string; action: string }) {
  return (
    <div className={`rounded-md border px-4 py-2.5 flex items-center justify-between gap-3 ${tone === 'warn' ? 'bg-orange-50 border-orange-100' : 'bg-white border-slate-200/70'}`}>
      <p className="text-sm min-w-0"><b className="text-ink-900">{title}</b> <span className="text-slate-500">{text}</span></p>
      <Link href={href} className="flex-shrink-0 text-sm font-medium text-ink-600 hover:text-ink-800">{action}</Link>
    </div>
  );
}

export default function DashboardPage() {
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const dash = useDashboardLayout();
  const { data: nameData } = useQuery(ME_NAME);
  const { data: consultData, loading } = useQuery(MY_CONSULTATIONS);
  // Refetched on every visit, so a check-in or weigh-in just done shows up straight away.
  const { data: journeyData } = useQuery(MY_WEIGHT_JOURNEY, { fetchPolicy: 'cache-and-network' });
  const { data: planData, loading: planLoading } = useQuery(MY_TREATMENT_PLAN, { fetchPolicy: 'cache-and-network' });
  const journey = journeyData?.myWeightJourney;
  const next = useCareStage();
  const plan = planData?.myTreatmentPlan;

  const consultations = consultData?.myConsultations ?? [];
  const needsInfo = consultations.some((c: any) => c.status === 'MORE_INFO_REQUESTED');
  const firstName = nameData?.me?.firstName;

  // Every card on the screen, by the id the layout uses. A card with nothing to show returns null (the treatment details
  // have no plan to show before one exists).
  // How many updates the card lists at each size.
  const UPDATES_SHOWN = { small: 3, medium: 4, large: 8 } as const;
  // A card in the narrow column, or at its smallest, is laid out in one column; at medium width, in fewer.
  const placeOfCard = (id: string) => (['top', 'main', 'side'] as const).find((z) => dash.layout[z].includes(id));
  const isNarrow = (id: string) => placeOfCard(id) === 'side' || (placeOfCard(id) === 'main' && sizeOf(dash.layout, id) === 'small');
  const isCompact = (id: string) => placeOfCard(id) === 'main' && sizeOf(dash.layout, id) === 'medium';
  const cards: Record<string, { node: React.ReactNode; span?: string }> = {
    progress: {
      node: planLoading && !plan ? (
        <section aria-label="Your treatment progress" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-[1800px]:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5].map((k) => <SkeletonTile key={k} className="bg-white" label="Loading…" />)}
        </section>
      ) : (
        <ProgressOverview journey={journey} plan={plan} compact={isCompact('progress')} narrow={isNarrow('progress')} />
      ),
    },
    plan: {
      span: 'md:col-span-6',
      node: plan ? (
        <PlanHero plan={plan} compact={isNarrow('plan')} />
      ) : planLoading || next.stage === 'LOADING' ? (
        <SkeletonCard lines={5} className="min-h-[16rem] bg-white" label="Loading your treatment plan…" />
      ) : (
        <Card className="h-full">
          <p className="text-sm font-medium text-ink-700">Current Treatment Plan</p>
          <h2 className="text-xl font-bold text-ink-900 mt-2">{next.title}</h2>
          {next.text && <p className="text-sm text-slate-500 mt-2 max-w-xl">{next.text}</p>}
          {next.action && <Link href={next.action.href} className={`${btnPrimary} mt-4`}>{next.action.label}</Link>}
        </Card>
      ),
    },
    treatment: { span: 'md:col-span-6', node: plan ? <TreatmentPlanCard plan={plan} /> : null },
    updates: { node: <RecentUpdates limit={UPDATES_SHOWN[sizeOf(dash.layout, 'updates') ?? 'small']} /> },
    orders: { node: <RecentOrders /> },
    quickLinks: { node: <QuickLinks columns={sizeOf(dash.layout, 'quickLinks') === 'large' ? 2 : 1} /> },
    profile: { node: <ProfileSummaryCard journey={journey} /> },
    chat: { node: <ChatCard /> },
    appointment: { node: <AppointmentCard /> },
    emergency: { node: <EmergencyCard /> },
    contact: { node: <ContactCard /> },
  };

  // How wide a card is in the wide column (in the narrow one every card is the full width of it). A card that can be
  // resized is a third of the row, half of it or all of it; the others keep one width.
  const FIXED_SPAN: Record<string, string> = {};
  const SIZE_SPAN = { small: 'md:col-span-3 2xl:col-span-2', medium: 'md:col-span-3 2xl:col-span-3', large: 'md:col-span-6' } as const;
  const SMALL_IN_MAIN = SIZE_SPAN.small;
  const spanOf = (id: string) => {
    const size = sizeOf(dash.layout, id);
    return size ? SIZE_SPAN[size] : FIXED_SPAN[id] ?? SMALL_IN_MAIN;
  };
  const draggedWidget = DASHBOARD_WIDGETS.find((w) => w.id === dragId);

  const renderZone = (zone: 'top' | 'main' | 'side') => {
    const ids = dash.layout[zone].filter((id) => cards[id]?.node);
    return ids.map((id, i) => {
      const widget = DASHBOARD_WIDGETS.find((w) => w.id === id)!;
      // The other place it can go: the narrow column from the wide one (or the full-width row above them), and back to the wide one from anywhere else.
      const other = zone === 'main' ? (widget.zones.includes('side') ? 'side' : widget.zones.includes('top') ? 'top' : undefined) : widget.zones.includes('main') ? 'main' : undefined;
      const size = sizeOf(dash.layout, id);
      return (
        <CustomizeSlot
          key={id}
          title={widget.title}
          editing={editing}
          required={widget.required}
          zone={zone}
          otherZone={other}
          first={i === 0}
          last={i === ids.length - 1}
          dragging={dragId === id}
          canDropHere={!!draggedWidget && draggedWidget.zones.includes(zone)}
          onMove={(delta) => dash.move(id, delta)}
          onSwitchColumn={() => other && dash.moveTo(id, other)}
          onRemove={() => { if (!widget.confirmHide || window.confirm(widget.confirmHide)) dash.hide(id); }}
          onDragStart={() => setDragId(id)}
          onDragEnd={() => setDragId(null)}
          onDropOn={() => { if (dragId) dash.moveTo(dragId, zone, id); setDragId(null); }}
          className={zone === 'main' ? spanOf(id) : ''}
          size={zone === 'main' ? size ?? undefined : undefined}
          sizeOptions={widget.sizes}
          onSetSize={(next) => dash.setSize(id, next)}
        >
          {cards[id].node}
        </CustomizeSlot>
      );
    });
  };

  /** A column that a card can be dropped on the end of, and that says so while one is being dragged. */
  const dropColumn = (zone: 'main' | 'side', className: string, empty: string) => {
    const ok = !!draggedWidget && draggedWidget.zones.includes(zone);
    return (
      <div
        className={`${className} ${editing && dragId && ok ? 'rounded-lg ring-2 ring-brand-600/30 ring-offset-4' : ''}`}
        onDragOver={(e) => { if (ok) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
        onDrop={(e) => { if (!ok || !dragId) return; e.preventDefault(); dash.moveTo(dragId, zone); setDragId(null); }}
      >
        {renderZone(zone)}
        {editing && dash.layout[zone].length === 0 && (
          <div className="md:col-span-6 xl:col-span-1 rounded-lg border-2 border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">{empty}</div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-5 -mt-1">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink-900">{firstName ? `Welcome back, ${firstName}!` : 'Welcome back!'}</h1>
          <p className="text-sm text-slate-500 mt-0.5 mb-2">Here’s your health journey at a glance.</p>
          <SubscriptionStatus />
        </div>
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            aria-pressed={editing}
            className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${editing ? 'bg-ink-800 text-white border-ink-800' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
          >
            {editing ? 'Done' : 'Customize'}
          </button>
          <button type="button" onClick={() => setReporting(true)} className="text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg px-3 py-1.5">
            Report a side effect
          </button>
        </div>
      </div>

      <div className="space-y-2 mb-4 empty:hidden">
        {!loading && needsInfo && (
          <Notice tone="warn" title="Your clinician needs more information." text="Check your messages, then update your answers." href="/onboarding/medical-questionnaire?from=dashboard" action="Update answers →" />
        )}
        {journey && <WeightTrendNotice />}
      </div>

      {editing && (
        <section aria-label="Customize your home screen" className="mb-5 rounded-lg border border-ink-100 bg-ink-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink-900">Make this screen yours</h2>
              <p className="text-sm text-slate-600 mt-0.5">Drag a card to move it, or use its arrows. Drag the corner of a card to make it smaller or bigger. Remove the ones you don’t need, and add them back any time.</p>
            </div>
            <button type="button" onClick={dash.restoreDefaults} className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2">Reset to the original layout</button>
          </div>
          <InlineError error={dash.error} size="xs" className="mt-2" />
          {dash.staffHidden.length > 0 && (
            <p className="mt-3 text-xs text-slate-600 bg-white border border-slate-200 rounded-md px-3 py-2">
              {dash.staffHidden.map((h) => `${DASHBOARD_WIDGETS.find((w) => w.id === h.id)?.title ?? h.id} (until ${new Date(h.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})`).join(', ')}
              {' '}— hidden for you for now by our team. {dash.staffHidden.length === 1 ? 'It comes' : 'They come'} back by {dash.staffHidden.length === 1 ? 'itself' : 'themselves'}.
            </p>
          )}
          <div className="mt-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Cards you can add</p>
            {dash.layout.hidden.length === 0 ? (
              <p className="text-sm text-slate-400">Every card is showing.</p>
            ) : (
              <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {dash.layout.hidden.map((id) => {
                  const w = DASHBOARD_WIDGETS.find((x) => x.id === id)!;
                  return (
                    <li key={id} className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-md px-3 py-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900 truncate">{w.title}</span>
                        <span className="block text-xs text-slate-500 truncate">{w.description}</span>
                      </span>
                      <button type="button" onClick={() => dash.show(id)} className="shrink-0 text-xs font-semibold text-ink-700 bg-ink-50 hover:bg-ink-100 rounded-md px-2.5 py-1.5">Add</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {renderZone('top')}

      <div className={`grid grid-cols-1 gap-5 items-start ${editing || dash.layout.side.length > 0 ? 'xl:grid-cols-[minmax(0,1fr)_18.5rem]' : ''}`}>
        {dropColumn('main', 'grid grid-cols-1 md:grid-cols-6 gap-5 min-w-0 [&>*]:min-w-0', 'Drop a card here')}
        {(editing || dash.layout.side.length > 0) && dropColumn('side', 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-5 min-w-0 [&>*]:min-w-0', 'Drop a card here')}
      </div>

      <footer className="mt-8 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <p className="flex items-center gap-2"><Icon name="help" className="w-4 h-4" /> Your health is our priority. We’re here to support you every step of the way.</p>
        <nav className="flex gap-5" aria-label="Legal">
          <Link href="/settings#privacy" className="hover:text-ink-800">Privacy</Link>
          <Link href="/settings#help" className="hover:text-ink-800">Help</Link>
        </nav>
      </footer>

      {reporting && <ReportSideEffectDialog onClose={() => setReporting(false)} />}
    </div>
  );
}
