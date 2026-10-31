'use client';

import Link from 'next/link';
import { useUnreadMessages } from '@/lib/useUnreadMessages';
import { CONTACT, EMERGENCY_NUMBER, telHref } from '@/lib/contact';
import { Card, btnBlue, btnSoft } from '@/components/portal/Card';
import { Icon, type IconName } from '@/components/portal/Icon';
import { useI18n } from '@/lib/i18n/I18nProvider';

function Lead({ icon, title, text, tone = 'ink' }: { icon: IconName; title: string; text: string; tone?: 'ink' | 'red' }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${tone === 'red' ? 'bg-red-500 text-white' : 'bg-ink-50 text-ink-700'}`}><Icon name={icon} /></span>
      <div className="min-w-0">
        <h2 className={`text-base font-semibold ${tone === 'red' ? 'text-red-700' : 'text-ink-900'}`}>{title}</h2>
        <p className={`text-sm mt-0.5 ${tone === 'red' ? 'text-red-600' : 'text-slate-500'}`}>{text}</p>
      </div>
    </div>
  );
}

export function ChatCard() {
  const { t, timeAgo } = useI18n();
  const { unread, latest } = useUnreadMessages();
  return (
    <Card>
      <Lead icon="chat" title={t('Chat with your doctor')} text={t('Ask questions, get advice, or share updates.')} />
      {latest && latest.senderRole !== 'PATIENT' && (
        <p className="text-xs text-slate-600 bg-slate-50 rounded-md p-3 mt-3 line-clamp-2">
          <b className="text-ink-900">{unread ? t('New reply') : t('Last reply')} · {timeAgo(latest.sentAt)}</b><br />“{latest.content}”
        </p>
      )}
      <Link href="/messages" className={`${btnBlue} w-full mt-4`}><Icon name="chat" className="w-4 h-4" /> {unread ? t('Open chat ({n} new)', { n: unread }) : t('Open chat')}</Link>
    </Card>
  );
}

export function AppointmentCard() {
  const { t } = useI18n();
  return (
    <Card>
      <Lead icon="calendar" title={t('Book an appointment')} text={t('Need a check-up, have side effects, or other concerns?')} />
      <Link href="/appointments?new=1" className={`${btnSoft} w-full mt-4`}><Icon name="calendar" className="w-4 h-4" /> {t('Book appointment')}</Link>
    </Card>
  );
}

/** For severe symptoms: the emergency number, plus the clinic's urgent line and a 24-hour urgent request. */
export function EmergencyCard() {
  // Always there, but quiet: one line, the number, and the non-urgent route beside it.
  const { t } = useI18n();
  return (
    <section aria-label={t('In an emergency')} className="rounded-2xl border border-red-200 bg-red-50/60 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0"><Icon name="alert" className="w-4 h-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-red-900"><b>{t('Severe side effects?')}</b> {t('Get help now.')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <a href={telHref(CONTACT.urgentPhone ?? EMERGENCY_NUMBER)} className="inline-flex items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-3.5 py-1.5">
              <Icon name="phone" className="w-4 h-4" /> {CONTACT.urgentPhone ? t('Call 24/7') : t('Call {number}', { number: EMERGENCY_NUMBER })}
            </a>
            <Link href="/appointments?new=1&urgent=1" className="text-xs font-medium text-red-700 hover:text-red-800">{t('Not life-threatening? Urgent appointment, within 24h →')}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactRow({ icon, label, children, tone = 'ink' }: { icon: IconName; label: string; children: React.ReactNode; tone?: 'ink' | 'red' }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-ink-50 text-ink-700'}`}><Icon name={icon} className="w-4 h-4" /></span>
      <div className="text-xs text-slate-600 min-w-0"><p className="font-semibold text-ink-900">{label}</p>{children}</div>
    </div>
  );
}

export function ContactCard() {
  const { t } = useI18n();
  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink-900 mb-1">{t('Contact information')}</h2>
      {CONTACT.phone && (
        <ContactRow icon="phone" label={t('Phone')}>
          <a href={telHref(CONTACT.phone)} className="hover:underline">{CONTACT.phone}</a>
          {CONTACT.phoneHours && <p className="text-slate-500">({CONTACT.phoneHours})</p>}
        </ContactRow>
      )}
      {CONTACT.email && <ContactRow icon="mail" label={t('Email')}><a href={`mailto:${CONTACT.email}`} className="hover:underline break-all">{CONTACT.email}</a></ContactRow>}
      <ContactRow icon="alert" label={t('Emergency line')} tone="red">
        <a href={telHref(CONTACT.urgentPhone ?? EMERGENCY_NUMBER)} className="hover:underline">{CONTACT.urgentPhone ?? EMERGENCY_NUMBER}</a>
        <p className="text-slate-500">{CONTACT.urgentPhone ? t('(24/7 – for urgent cases only)') : t('(emergency services)')}</p>
      </ContactRow>
      <ContactRow icon="chat" label={t('Messages')}><Link href="/messages" className="hover:underline">{t('Message your care team')}</Link></ContactRow>
      <div className="mt-3 rounded-md bg-amber-50 border border-amber-100 p-3 flex gap-2.5">
        <Icon name="alert" className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900"><b>{t('Important')}</b><br />{t('This platform is for medical support and treatment management only. It does not replace emergency services.')}</p>
      </div>
    </Card>
  );
}
