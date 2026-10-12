/**
 * What a notification can be about, and the words each app shows for it.
 *
 * The backend stores only a `kind`, its `params` and how many events the row stands for (`count`); every app turns that
 * into text here, so the patient web app, the mobile app and a push message all say the same thing, and the clinician
 * portal can translate it (pass its `t` as `translate`: the English templates below are its dictionary keys).
 *
 * Patient texts show on a locked phone, so they never name a medicine, a condition or an amount of medicine. Staff
 * texts can name the patient: they are only shown inside the signed-in clinician portal.
 *
 * To add a kind: add it to NotificationKind and NOTIFICATION_TEXT, send it from the backend with NotifierService, and add
 * the staff wording to the clinician dictionaries.
 */
export enum NotificationKind {
  // To a patient.
  CARE_TEAM_MESSAGE = 'CARE_TEAM_MESSAGE',
  TREATMENT_UPDATE = 'TREATMENT_UPDATE',
  CHECK_IN_READY = 'CHECK_IN_READY',
  DOSE_DUE = 'DOSE_DUE',
  APPOINTMENT_UPDATE = 'APPOINTMENT_UPDATE',
  ORDER_SHIPPED = 'ORDER_SHIPPED',
  ORDER_OUT_FOR_DELIVERY = 'ORDER_OUT_FOR_DELIVERY',
  ORDER_DELIVERED = 'ORDER_DELIVERED',
  ORDER_DELIVERY_FAILED = 'ORDER_DELIVERY_FAILED',
  REFUND_APPROVED = 'REFUND_APPROVED',
  REFUND_DECLINED = 'REFUND_DECLINED',
  REFERRAL_REWARD = 'REFERRAL_REWARD',

  // To staff.
  PATIENT_MESSAGE = 'PATIENT_MESSAGE',
  CONSULTATION_SUBMITTED = 'CONSULTATION_SUBMITTED',
  URGENT_APPOINTMENT = 'URGENT_APPOINTMENT',
  SIDE_EFFECT_REPORTED = 'SIDE_EFFECT_REPORTED',
  SIDE_EFFECT_SEVERE = 'SIDE_EFFECT_SEVERE',
  REFUND_REQUESTED = 'REFUND_REQUESTED',
  ORDER_PROBLEM = 'ORDER_PROBLEM',
}

/** `urgent` ones are shown in red and, for staff, also emailed. */
export type NotificationTone = 'info' | 'success' | 'warning' | 'urgent';

export interface NotificationText {
  title: string;
  /** Used instead of `title` when the row stands for more than one event; `{count}` is filled in. */
  titleMany?: string;
  body: string;
  tone: NotificationTone;
}

export const NOTIFICATION_TEXT: Record<NotificationKind, NotificationText> = {
  [NotificationKind.CARE_TEAM_MESSAGE]: { title: 'New message from your care team', titleMany: '{count} new messages from your care team', body: 'Open the chat to read it.', tone: 'info' },
  // The headline is one of a fixed set chosen on the backend (e.g. "Your treatment has been approved").
  [NotificationKind.TREATMENT_UPDATE]: { title: '{headline}', body: 'Open the app to see the details.', tone: 'info' },
  [NotificationKind.CHECK_IN_READY]: { title: 'Your check-in is ready', body: 'Your doctor reviews it before your next supply.', tone: 'warning' },
  [NotificationKind.DOSE_DUE]: { title: 'Your next dose is coming up', body: 'Log it once you have taken it.', tone: 'info' },
  [NotificationKind.APPOINTMENT_UPDATE]: { title: '{headline}', body: 'See your appointments for the details.', tone: 'info' },
  [NotificationKind.ORDER_SHIPPED]: { title: 'Your order has shipped', body: 'Track it under Orders.', tone: 'info' },
  [NotificationKind.ORDER_OUT_FOR_DELIVERY]: { title: 'Your order is out for delivery', body: 'It should reach you today.', tone: 'info' },
  [NotificationKind.ORDER_DELIVERED]: { title: 'Your order was delivered', body: 'Store it as the leaflet says.', tone: 'success' },
  [NotificationKind.ORDER_DELIVERY_FAILED]: { title: 'We couldn’t deliver your order', body: 'Open Orders to see what happens next.', tone: 'warning' },
  [NotificationKind.REFUND_APPROVED]: { title: 'Your refund was approved', body: 'It can take a few days to reach your account.', tone: 'success' },
  [NotificationKind.REFUND_DECLINED]: { title: 'About your refund request', body: 'The clinic isn’t able to refund this one. Message us if you have questions.', tone: 'info' },
  [NotificationKind.REFERRAL_REWARD]: { title: 'You earned a reward', body: 'Thanks for inviting a friend. See it under Rewards.', tone: 'success' },

  [NotificationKind.PATIENT_MESSAGE]: { title: '{patient} sent a message', titleMany: '{patient} sent {count} messages', body: 'Waiting for a reply', tone: 'info' },
  [NotificationKind.CONSULTATION_SUBMITTED]: { title: 'New consultation from {patient}', body: 'Waiting for review', tone: 'info' },
  [NotificationKind.URGENT_APPOINTMENT]: { title: 'Urgent appointment request', body: '{patient} needs to be seen within 24 hours', tone: 'urgent' },
  [NotificationKind.SIDE_EFFECT_REPORTED]: { title: '{patient} reported side effects', body: 'Review and acknowledge them', tone: 'warning' },
  [NotificationKind.SIDE_EFFECT_SEVERE]: { title: 'Severe side effects reported', body: '{patient} needs a doctor to look today', tone: 'urgent' },
  [NotificationKind.REFUND_REQUESTED]: { title: '{patient} asked for a refund', body: 'Waiting for an admin to decide', tone: 'warning' },
  [NotificationKind.ORDER_PROBLEM]: { title: 'An order could not be delivered', body: '{patient}’s parcel needs attention', tone: 'warning' },
};

export type NotificationParams = Record<string, string | number>;

const fill = (text: string, vars: NotificationParams) => text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/**
 * The words for one notification. `translate` receives the English template and the values to put in it (the clinician
 * portal's `t` has exactly this shape); without it the English is filled in. An unknown kind (an older app meeting a
 * newer backend) gets a neutral text rather than nothing.
 */
export function notificationText(
  kind: string,
  params: NotificationParams = {},
  count = 1,
  translate: (text: string, vars: NotificationParams) => string = fill,
): { title: string; body: string; tone: NotificationTone } {
  const def = NOTIFICATION_TEXT[kind as NotificationKind] ?? { title: 'You have a new update', body: 'Open the app to see it.', tone: 'info' as const };
  const vars = { ...params, count };
  const title = count > 1 && def.titleMany ? def.titleMany : def.title;
  return { title: translate(title, vars), body: translate(def.body, vars), tone: def.tone };
}

/**
 * What a patient can switch push on or off for. `essential` ones (a decision about their treatment, a refund, a
 * delivery that failed) are always pushed: missing one could matter. Staff notifications have no category.
 */
export type NotificationCategory = 'messages' | 'orders' | 'reminders' | 'rewards' | 'essential';

const CATEGORY: Partial<Record<NotificationKind, NotificationCategory>> = {
  [NotificationKind.CARE_TEAM_MESSAGE]: 'messages',
  [NotificationKind.ORDER_SHIPPED]: 'orders',
  [NotificationKind.ORDER_OUT_FOR_DELIVERY]: 'orders',
  [NotificationKind.ORDER_DELIVERED]: 'orders',
  [NotificationKind.CHECK_IN_READY]: 'reminders',
  [NotificationKind.DOSE_DUE]: 'reminders',
  [NotificationKind.APPOINTMENT_UPDATE]: 'reminders',
  [NotificationKind.REFERRAL_REWARD]: 'rewards',
};

export const notificationCategory = (kind: string): NotificationCategory => CATEGORY[kind as NotificationKind] ?? 'essential';
