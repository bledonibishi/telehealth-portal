'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { CONTACT, EMERGENCY_NUMBER, telHref } from '@/lib/contact';
import { Card } from '@/components/portal/Card';
import { Icon } from '@/components/portal/Icon';
import { SettingsSubpage } from '@/components/portal/SettingsMenu';

const FAQ: Array<[string, string]> = [
  ['When will my next supply arrive?', 'A few days before your current supply runs out, use “Order next dose early”. Your doctor approves it and the pharmacy sends it; you can follow it under Orders.'],
  ['What if I miss a dose?', 'Message your doctor — they’ll tell you whether to take it late or wait for the next one. If the dose is on your dose calendar, log it there as skipped too.'],
  ['Who can see my photos?', 'Only you and the doctors treating you. Every time a doctor opens one, it is recorded.'],
  ['How do I change or cancel my subscription?', 'Go to Settings → Billing & payments and use “Manage subscription”. It opens our payment provider, where you can update your card, see invoices, pause or cancel.'],
  ['Something feels wrong — what should I do?', `For chest pain, trouble breathing, severe stomach pain or fainting call ${EMERGENCY_NUMBER}. Otherwise book an urgent appointment — a doctor replies within 24 hours.`],
];

export default function HelpPage() {
  const { t } = useI18n();
  return (
    <SettingsSubpage wide title="Help & FAQ" subtitle="Answers to common questions, and how to reach us.">
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 flex gap-3">
        <Icon name="alert" className="w-5 h-5 mt-0.5 flex-shrink-0 text-rose-600" />
        <p className="text-sm text-rose-900">
          <span className="font-semibold">{t('Chest pain, trouble breathing, severe stomach pain or fainting?')}</span>{' '}
          <a href={telHref(EMERGENCY_NUMBER)} className="font-semibold underline">{t('Call {number} now.', { number: EMERGENCY_NUMBER })}</a> {t('Don’t wait for a message reply.')}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
        <Card className="sm:p-6">
          <h2 className="text-base font-semibold text-ink-900 mb-2">Common questions</h2>
          <div className="divide-y divide-slate-100">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-3 py-4 text-[15px] font-medium text-ink-900 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-600">
                  {q}
                  <span className="flex w-7 h-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 group-open:bg-ink-50 group-open:text-ink-700">
                    <Icon name="chevron" className="w-4 h-4 group-open:rotate-180 transition-transform" />
                  </span>
                </summary>
                <p className="pb-4 pr-10 text-sm leading-relaxed text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </Card>

        <aside className="space-y-5 lg:sticky lg:top-6">
          <div className="rounded-2xl bg-ink-800 text-white p-6">
            <span className="flex w-11 h-11 items-center justify-center rounded-full bg-white/10"><Icon name="chat" className="w-5 h-5" /></span>
            <h2 className="mt-4 text-lg font-semibold">Still need help?</h2>
            <p className="mt-1 text-sm text-white/75">Message your care team about your treatment, a payment, a delivery or your account.</p>
            <Link href="/messages" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50 transition-colors">
              Message us <Icon name="arrow" className="w-4 h-4" />
            </Link>
          </div>
          {(CONTACT.phone || CONTACT.email) && (
            <Card>
              <h2 className="text-sm font-semibold text-ink-900 mb-3">Other ways to reach us</h2>
              <ul className="space-y-3 text-sm">
                {CONTACT.phone && (
                  <li><a href={telHref(CONTACT.phone)} className="flex items-center gap-3 text-ink-800 hover:text-ink-600"><Icon name="phone" className="w-4 h-4 text-ink-700" /><span>{CONTACT.phone}{CONTACT.phoneHours && <span className="block text-xs text-slate-500">{CONTACT.phoneHours}</span>}</span></a></li>
                )}
                {CONTACT.email && (
                  <li><a href={`mailto:${CONTACT.email}`} className="flex items-center gap-3 text-ink-800 hover:text-ink-600 break-all"><Icon name="mail" className="w-4 h-4 text-ink-700 flex-shrink-0" />{CONTACT.email}</a></li>
                )}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </SettingsSubpage>
  );
}
