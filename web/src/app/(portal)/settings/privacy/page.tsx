import Link from 'next/link';
import { Card } from '@/components/portal/Card';
import { Icon, type IconName } from '@/components/portal/Icon';
import { SettingsSubpage } from '@/components/portal/SettingsMenu';

const PROTECTIONS: Array<[IconName, string, string]> = [
  ['user', 'Only your care team', 'Your medical details, photos and messages are visible only to you and the clinical team treating you.'],
  ['lock', 'Never public', 'Uploaded photos and documents have no public address. Each one is checked against who is asking before it is shown.'],
  ['shield', 'Every look is recorded', 'Each time a clinician opens one of your photos, it is logged, so access can always be checked.'],
];

const RIGHTS: Array<[IconName, string, string, string]> = [
  ['pencil', 'Correct your details', 'Update your contact, body and delivery details.', '/profile'],
  ['download', 'Get a copy of your data', 'Ask us for everything we hold about you.', '/messages'],
  ['trash', 'Delete your account', 'Ask us to close your account and erase your data.', '/messages'],
];

export default function PrivacyPage() {
  return (
    <SettingsSubpage wide title="Privacy & your data" subtitle="Who can see your details, and what you can ask us to do with them.">
      <section>
        <h2 className="px-1 mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">How we protect your data</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {PROTECTIONS.map(([icon, title, body]) => (
            <Card key={title} className="sm:p-6">
              <span className="flex w-11 h-11 items-center justify-center rounded-full bg-ink-50 text-ink-700"><Icon name={icon} className="w-5 h-5" /></span>
              <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="px-1 mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Your rights</h2>
        <ul className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(10,56,54,0.04)] divide-y divide-slate-100 overflow-hidden">
          {RIGHTS.map(([icon, label, hint, href]) => (
            <li key={label}>
              <Link href={href} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                <span className="flex w-10 h-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-ink-700"><Icon name={icon} className="w-5 h-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink-900">{label}</span>
                  <span className="block text-sm text-slate-500">{hint}</span>
                </span>
                <Icon name="right" className="w-4 h-4 text-slate-400 flex-shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 px-1 text-sm text-slate-500">
          Requests for a copy or a deletion go to our team by message, so we can check it is really you. Some records, like prescriptions, must be kept by law even after an account is closed.
        </p>
      </section>
    </SettingsSubpage>
  );
}
