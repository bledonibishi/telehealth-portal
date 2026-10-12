import { button, emailLayout, escapeHtml, heading, hero, paragraph } from '../email-layout';
import type { EmailContent } from './types';

/** To the person who referred a friend, once the friend has paid. */
export function referralRewardEmail(a: { firstName: string; amountLabel: string; autoApplied: boolean; rewardsUrl?: string }): EmailContent {
  return {
    subject: `You earned ${a.amountLabel} — a friend you referred just joined`,
    html: emailLayout({
      preheader: `You’ve earned ${a.amountLabel}: a friend you referred just joined.`,
      body: [
        heading('You earned a reward 🎉'),
        paragraph(`Hi ${escapeHtml(a.firstName)}, a friend you referred just made their first payment. Thank you for spreading the word.`),
        hero(a.amountLabel, a.autoApplied ? 'credited to your account.<br>It comes off your next bill automatically.' : 'is ready for you to use.<br>Apply it whenever you like.'),
        a.rewardsUrl ? button(a.autoApplied ? 'View my rewards' : 'Apply my reward', a.rewardsUrl) : '',
      ].join(''),
    }),
  };
}
