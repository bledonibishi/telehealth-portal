'use client';

import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import { useUnreadMessages } from '@/lib/useUnreadMessages';
import { CONTACT, EMERGENCY_NUMBER, telHref } from '@/lib/contact';
import { Card, btnBlue, btnSoft } from '@/components/portal/Card';
import { Icon, type IconName } from '@/components/portal/Icon';

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
  const { unread, latest } = useUnreadMessages();
  return (
    <Card>
      <Lead icon="chat" title="Chat with Your Doctor" text="Ask questions, get advice, or share updates." />
      {latest && latest.senderRole !== 'PATIENT' && (
        <p className="text-xs text-slate-600 bg-slate-50 rounded-xl p-3 mt-3 line-clamp-2">
          <b className="text-ink-900">{unread ? 'New reply' : 'Last reply'} · {formatDistanceToNowStrict(new Date(latest.sentAt))} ago</b><br />“{latest.content}”
        </p>
      )}
      <Link href="/messages" className={`${btnBlue} w-full mt-4`}><Icon name="chat" className="w-4 h-4" /> Open Chat{unread ? ` (${unread} new)` : ''}</Link>
    </Card>
  );
}

export function AppointmentCard() {
  return (
    <Card>
      <Lead icon="calendar" title="Book an Appointment" text="Need a check-up, have side effects, or other concerns?" />
      <Link href="/appointments?new=1" className={`${btnSoft} w-full mt-4`}><Icon name="calendar" className="w-4 h-4" /> Book Appointment</Link>
    </Card>
  );
}

/** For severe symptoms: the emergency number, plus the clinic's urgent line and a 24-hour urgent request. */
export function EmergencyCard() {
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/70 p-5">
      <Lead icon="alert" tone="red" title="Urgent / Emergency" text="Severe side effects? Contact us immediately." />
      <a href={telHref(CONTACT.urgentPhone ?? EMERGENCY_NUMBER)} className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2.5">
        <Icon name="phone" className="w-4 h-4" /> {CONTACT.urgentPhone ? 'Call Now (24/7)' : `Call ${EMERGENCY_NUMBER}`}
      </a>
      <Link href="/appointments?new=1&urgent=1" className="block text-center text-xs font-medium text-red-700 hover:text-red-800 mt-2.5">Not life-threatening? Request an urgent appointment (answered within 24h) →</Link>
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
  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink-900 mb-1">Contact Information</h2>
      {CONTACT.phone && (
        <ContactRow icon="phone" label="Phone">
          <a href={telHref(CONTACT.phone)} className="hover:underline">{CONTACT.phone}</a>
          {CONTACT.phoneHours && <p className="text-slate-500">({CONTACT.phoneHours})</p>}
        </ContactRow>
      )}
      {CONTACT.email && <ContactRow icon="mail" label="Email"><a href={`mailto:${CONTACT.email}`} className="hover:underline break-all">{CONTACT.email}</a></ContactRow>}
      <ContactRow icon="alert" label="Emergency Line" tone="red">
        <a href={telHref(CONTACT.urgentPhone ?? EMERGENCY_NUMBER)} className="hover:underline">{CONTACT.urgentPhone ?? EMERGENCY_NUMBER}</a>
        <p className="text-slate-500">{CONTACT.urgentPhone ? '(24/7 – for urgent cases only)' : '(emergency services)'}</p>
      </ContactRow>
      <ContactRow icon="chat" label="Messages"><Link href="/messages" className="hover:underline">Message your care team</Link></ContactRow>
      <div className="mt-3 rounded-xl bg-amber-50 border border-amber-100 p-3 flex gap-2.5">
        <Icon name="alert" className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-900"><b>Important</b><br />This platform is for medical support and treatment management only. It does not replace emergency services.</p>
      </div>
    </Card>
  );
}
