/**
 * What the automated support assistant is allowed to tell a patient. It answers only from these articles: a question none of
 * them covers goes to a person. Each one is something the patient app really does today (the Help & FAQ in Settings, the
 * sign-in pages, Profile, Orders), written plainly.
 *
 * (These are the starting set. Once they are in the database the team edits them in the portal, under Assistant.)
 *
 * Add an article whenever a question keeps being handed to the team and has a settled answer. Two kinds of things are left
 * out on purpose until the clinic has decided them: delivery times and refund rules. Never put medical advice here: a health
 * question is never the assistant's to answer.
 *
 * `handoff`: the answer is only a first step and a person must follow up (the assistant answers, then opens it for the team).
 */
export type SupportArticle = { id: string; title: string; body: string; handoff?: boolean };

/** The articles the assistant starts with. They are copied into the database the first time it is needed, and from then on the team edits them in the portal. */
export const DEFAULT_ARTICLES: SupportArticle[] = [
  {
    id: 'reset-password',
    title: 'I forgot my password',
    body: 'On the sign-in page choose “Forgot password” and enter the email you signed up with. We email a link to set a new password. If it does not arrive within a few minutes, check the spam folder and check the address is the right one.',
  },
  {
    id: 'change-password',
    title: 'Changing my password while signed in',
    body: 'Open Settings and use the Password section. You are asked for your current password first, and the new one needs at least 10 characters.',
  },
  {
    id: 'activation-email',
    title: 'I did not get the email to set up my account',
    body: 'After payment we email a link to set a password and open your account. Check the spam folder and check the address you paid with. If it is not there, the team can send you a new link.',
    handoff: true,
  },
  {
    id: 'manage-subscription',
    title: 'Card, invoices, pausing or cancelling the subscription',
    body: 'Open Settings and use “Manage subscription”. It opens our payment provider, where you can update your card, see and download invoices, pause or cancel.',
  },
  {
    id: 'stop-or-refund',
    title: 'Stopping payments or asking for a refund',
    body: 'In Settings, the “Stop or refund” section lets you stop future payments, or ask the clinic for your money back. A refund request is decided by the clinic, so the assistant cannot promise one.',
    handoff: true,
  },
  {
    id: 'track-order',
    title: 'Where is my order',
    body: 'Open Orders. Each order shows its stage and, once it has shipped, the courier and tracking number with a link. If something went wrong with a delivery, Orders shows a notice.',
  },
  {
    id: 'next-supply',
    title: 'When will my next supply arrive',
    body: 'A few days before your current supply runs out, use “Order next dose early”. Your doctor approves it and the pharmacy sends it. You can follow it under Orders.',
  },
  {
    id: 'update-details',
    title: 'Changing my address, phone or details',
    body: 'Open Profile. You can edit your delivery address and phone there. If an order has already shipped, tell us and the team will check what can be done.',
  },
  {
    id: 'notifications',
    title: 'Choosing which notifications I get',
    body: 'Open Settings and use Notifications to choose what we send to your phone and by email.',
  },
  {
    id: 'photo-privacy',
    title: 'Who can see my photos',
    body: 'Only you and the doctors treating you. Every time a doctor opens a photo, it is recorded.',
  },
  {
    id: 'refer-and-earn',
    title: 'Referring a friend',
    body: 'Open Refer & earn (under Settings → Account) to copy your personal link. When a friend joins through it, you both get a reward.',
  },
];

/** The articles as the model sees them. */
export const articlesForPrompt = (articles: SupportArticle[]) => articles.map((a) => `[${a.id}] ${a.title}\n${a.body}`).join('\n\n');
