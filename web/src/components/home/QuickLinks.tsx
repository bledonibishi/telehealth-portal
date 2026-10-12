import Link from 'next/link';
import { Card } from '@/components/portal/Card';
import { Icon, type IconName } from '@/components/portal/Icon';

const LINKS: Array<{ href: string; icon: IconName; title: string; text: string }> = [
  { href: '/treatment-plan', icon: 'plan', title: 'Treatment Plan', text: 'View your full plan and dosage details' },
  { href: '/weight-journey', icon: 'scale', title: 'Weight Journey', text: 'Track your weight and see your progress' },
  { href: '/orders', icon: 'cart', title: 'Orders & Prescriptions', text: 'View order history and delivery status' },
  { href: '/settings#help', icon: 'help', title: 'Support & FAQ', text: 'Answers to common questions' },
];

export function QuickLinks() {
  return (
    <Card labelledBy="links-title" className="h-full">
      <h2 id="links-title" className="text-base font-semibold text-ink-900 mb-2">Quick Links</h2>
      <ul className="divide-y divide-slate-100">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex items-center gap-3 py-3 group">
              <span className="w-9 h-9 rounded-full bg-ink-50 text-ink-700 flex items-center justify-center flex-shrink-0"><Icon name={l.icon} className="w-4 h-4" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-900 group-hover:text-ink-600">{l.title}</span>
                <span className="block text-xs text-slate-500">{l.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
