import type { GuideTour } from '@telehealth/guide';

// The guide's tours for the clinician portal. Every text is English and goes through t(), so add each one to the three
// dictionaries. A step whose target is not on the page is skipped: the welcome tour lists every menu item, and each role
// is shown only the ones it has. Targets are `data-guide` attributes; `nav:/path` is the menu link (portal layout).
// Change a tour's id (v1 → v2) when you rewrite it, so people who saw the old one get the new one.

export const WELCOME_TOUR: GuideTour = {
  id: 'clinician.welcome.v1',
  title: 'Tour of the portal',
  steps: [
    { title: 'Welcome to the Omopharmacy portal', body: 'This guide shows you around. It lights up one part of the screen at a time and says what it is for. Use Next and Back, or the arrow keys. Esc closes it.' },
    { target: 'menu-button', title: 'The menu', body: 'Every part of the portal is in this menu. You only see the parts your role works with.' },
    { target: 'nav:/', title: 'Dashboard', body: 'The clinic at a glance: revenue, new leads, patients, consultations and orders.' },
    { target: 'nav:/leads', title: 'Leads', body: 'People who took the eligibility quiz. See who hasn’t paid yet, so you can follow up.' },
    { target: 'nav:/tickets', title: 'Tickets', body: 'Patients’ requests for help (technical, billing, delivery, account or clinical) and who is handling each one.' },
    { target: 'nav:/patients', title: 'Patients', body: 'Every patient: profile, treatment, weight, messages and documents. Search, filter, or describe who you are looking for in plain words.' },
    { target: 'nav:/assistant', title: 'Assistant', body: 'The automated assistant that answers patients’ everyday questions. Rate its answers and edit the help articles it is allowed to use.' },
    { target: 'nav:/queue', title: 'Review queue', body: 'New consultations waiting for a doctor. Open one to read the questionnaire, then approve, decline or ask the patient for more.' },
    { target: 'nav:/check-ins', title: 'Check-ins', body: 'Patients’ regular check-ins (weight, side effects, doses) waiting for review. Worrying side effects are listed first.' },
    { target: 'nav:/appointments', title: 'Appointments', body: 'Your diary, and patients asking to see a doctor. Urgent requests are answered within 24 hours.' },
    { target: 'nav:/labs', title: 'Labs', body: 'Blood tests that need attention: testosterone monitoring and results outside the normal range.' },
    { target: 'nav:/orders', title: 'Orders', body: 'Every order from payment to the patient’s door: pack it, hand it to the courier, and follow the parcel.' },
    { target: 'nav:/shipments', title: 'Next shipments', body: 'Patients whose next supply is coming up or late, so nobody runs out of medicine.' },
    { target: 'nav:/billing', title: 'Billing', body: 'Refund requests, supplies waiting to be paid for, and payments that failed.' },
    { target: 'nav:/shop', title: 'Shop', body: 'The online shop: products sold without a prescription, their orders and fiscal receipts.' },
    { target: 'nav:/team', title: 'Team & Roles', body: 'Invite staff and choose what each person can do: admin, doctor, CX team or pharmacy partner.' },
    { target: 'nav:/reports', title: 'Monthly report', body: 'The clinic month by month: patients, revenue, check-in decisions and weight lost.' },
    { target: 'nav:/audit', title: 'Audit log', body: 'Who opened or changed what, and when. Entries can never be edited or deleted.' },
    { target: 'notifications', title: 'Notifications', body: 'Anything that needs you: new messages, consultations, orders. The red numbers in the menu count the same things.' },
    { target: 'header-tools', title: 'Language and appearance', body: 'Choose the portal’s language and switch between light and dark mode. Your choice is kept on this computer.' },
    { target: 'guide-switch', title: 'The guide', body: 'Switch the guide on or off here. While it is on, each page explains itself the first time you open it, and the Guide button at the bottom right replays any tour.' },
  ],
};

const header = (title: string, body: string) => ({ target: 'page-header', title, body });

/** One tour per page, found by the path (see `pageTourFor`). */
const PAGE_TOURS: Record<string, GuideTour> = {
  '/': {
    id: 'clinician.page.dashboard.v2',
    title: 'Dashboard',
    steps: [
      header('Your day at a glance', 'The dashboard sums up the whole clinic. Every number is live.'),
      { target: 'dashboard:attention', title: 'Needs attention', body: 'What is waiting on the team: consultations to decide, supplies to send, refund requests and failed payments. Each opens the page where you deal with it.' },
      { target: 'dashboard:revenue', title: 'Revenue and sales funnel', body: 'Money taken and how visitors turn into patients, for the period you choose.' },
      { target: 'dashboard:trends', title: 'Month by month', body: 'New leads and patients, revenue, supplies sent and check-in decisions over the last months. Point at a month to see its numbers.' },
      { target: 'dashboard:totals', title: 'All time', body: 'Totals since the clinic opened.' },
    ],
  },
  '/queue': {
    id: 'clinician.page.queue.v1',
    title: 'Review queue',
    steps: [
      header('Consultations waiting for a doctor', 'Every new questionnaire lands here. The number shows how many are waiting.'),
      { target: 'queue:list', title: 'One row per consultation', body: 'The patient, the programme, its status and any red flags. Click a row to open it and decide.' },
    ],
  },
  '/consultation': {
    id: 'clinician.page.consultation.v1',
    title: 'Consultation',
    steps: [
      { target: 'consultation:header', title: 'Who and what', body: 'The patient, their age and programme, the status and the risk level worked out from their answers.' },
      { target: 'consultation:decision', title: 'Your decision', body: 'Claim the consultation so colleagues know you’re on it, then approve and prescribe, or decline.' },
      { target: 'consultation:flags', title: 'Clinical flags', body: 'Answers that need a closer look before you decide.' },
      { target: 'consultation:answers', title: 'Identity and answers', body: 'The ID and photo checks, then every questionnaire answer, grouped by section.' },
      { target: 'consultation:sidebar', title: 'The patient', body: 'Contact details, onboarding, the current prescription and earlier consultations.' },
      { target: 'consultation:chat', title: 'Secure messages', body: 'Write to the patient without leaving the consultation. Everything here is kept in their record.' },
    ],
  },
  '/patients': {
    id: 'clinician.page.patients.v1',
    title: 'Patients',
    steps: [
      header('All your patients', 'Hover a patient for a quick preview, click to open the full profile. Export the list as CSV or add a patient here.'),
      { target: 'patients:alerts', title: 'Health alerts', body: 'Patients whose recent results need a review. Open the record to see the trend.' },
      { target: 'patients:stats', title: 'Quick filters', body: 'Each card is also a filter. Click one to see only those patients, click it again for everyone.' },
      { target: 'patients:search', title: 'Search', body: 'Find patients by name, email or ID. Where smart search is switched on, you can also describe them in plain words, for example “active patients who joined this month”.' },
    ],
  },
  '/leads': {
    id: 'clinician.page.leads.v1',
    title: 'Leads',
    steps: [
      header('People who took the quiz', 'Everyone who checked whether they qualify, paid or not. Export the list as CSV at the top right.'),
      { target: 'leads:stats', title: 'Conversion', body: 'How many leads became patients. Click a card to filter the list.' },
      { target: 'leads:filters', title: 'Search and programme', body: 'Find someone by name or email, or show one programme only.' },
      { target: 'leads:list', title: 'The list', body: 'Each lead and whether they paid, so the CX team knows whom to contact.' },
    ],
  },
  '/tickets': {
    id: 'clinician.page.tickets.v1',
    title: 'Tickets',
    steps: [
      header('Patients asking for help', 'Each ticket is one request, with who is handling it and how long it has been open.'),
      { target: 'tickets:new', title: 'New ticket', body: 'Open a ticket yourself, for example after a phone call.' },
      { target: 'tickets:filters', title: 'Views and types', body: 'Active, yours, with engineering or resolved, and by type. Search by subject, patient or ticket number.' },
      { target: 'tickets:list', title: 'The tickets', body: 'Click one to read the conversation and reply. Saved replies save typing; medical questions are left to a doctor.' },
    ],
  },
  '/orders': {
    id: 'clinician.page.orders.v1',
    title: 'Orders',
    steps: [
      header('From payment to delivery', 'Every order goes through the same steps. You only do the ones in your hands; the rest happens on its own.'),
      { target: 'orders:tiles', title: 'Where each order is', body: 'To pack, ready for pickup, with the courier, problems, delivered. Click a tile to see those orders.' },
      { target: 'orders:how', title: 'How it works', body: 'The steps for the pharmacy, in order. Open it whenever you need a reminder.' },
      { target: 'orders:search', title: 'Find an order', body: 'Search by name, parcel code or tracking number. The search also tells you what it found in the other tiles.' },
    ],
  },
  '/check-ins': {
    id: 'clinician.page.checkins.v1',
    title: 'Check-ins',
    steps: [
      header('Check-ins to review', 'Patients report their weight, doses and side effects regularly. Each one waits here for a doctor.'),
      { target: 'checkins:alerts', title: 'Worrying side effects', body: 'Side effects that need a doctor soon are shown first.' },
      { target: 'checkins:list', title: 'The check-ins', body: 'Click one to read the answers and side effects, then decide on the next prescription.' },
    ],
  },
  '/appointments': {
    id: 'clinician.page.appointments.v1',
    title: 'Appointments',
    steps: [
      header('Patients asking to see a doctor', 'Urgent requests must be answered within 24 hours, routine ones within 3 days.'),
      { target: 'appointments:diary', title: 'Your diary', body: 'The appointments booked for the next 14 days. Requests waiting for a time are listed underneath.' },
    ],
  },
  '/labs': {
    id: 'clinician.page.labs.v1',
    title: 'Labs',
    steps: [header('Blood tests that need attention', 'Testosterone monitoring that is due, and results outside the normal range. Enter new results from the patient’s Labs tab.')],
  },
  '/shipments': {
    id: 'clinician.page.shipments.v1',
    title: 'Next shipments',
    steps: [header('Nobody runs out of medicine', 'Patients whose next supply is coming up or late. Once the repeat order is placed it goes to the pharmacy partner.')],
  },
  '/billing': {
    id: 'clinician.page.billing.v1',
    title: 'Billing',
    steps: [header('Money matters', 'Refund requests to decide, supplies waiting to be paid for, and payments that failed and can be retried.')],
  },
  '/shop': {
    id: 'clinician.page.shop.v1',
    title: 'Shop',
    steps: [header('The online shop', 'Products sold on the website without a prescription, their orders, and the fiscal receipts for each sale.')],
  },
  '/assistant': {
    id: 'clinician.page.assistant.v1',
    title: 'Assistant',
    steps: [
      header('The patients’ assistant', 'It answers everyday questions so the team doesn’t have to. Anything medical is handed to a person.'),
      { target: 'assistant:tabs', title: 'Two sides', body: '“How it’s doing” shows answers to rate and conversations handed to a person. “Help articles” is what it is allowed to tell patients.' },
    ],
  },
  '/team': {
    id: 'clinician.page.team.v1',
    title: 'Team & Roles',
    steps: [
      header('Who works in the portal', 'Every staff account, its role and whether it is active.'),
      { target: 'team:add', title: 'Add a member', body: 'Invite someone by email. They choose their own password from the invitation.' },
      { target: 'team:roles', title: 'Roles', body: 'What each role can see and do. Click a role to list only its members.' },
    ],
  },
  '/reports': {
    id: 'clinician.page.reports.v1',
    title: 'Monthly report',
    steps: [header('The clinic month by month', 'Patients, revenue, check-in decisions and weight lost. Choose how many months to show and export them as CSV.')],
  },
  '/audit': {
    id: 'clinician.page.audit.v1',
    title: 'Audit log',
    steps: [
      header('Every access is recorded', 'Who opened or changed what, and when. Entries can never be edited or deleted.'),
      { target: 'audit:filters', title: 'Filters', body: 'Narrow the log by action, dates or one patient.' },
    ],
  },
};

/** A doctor's start page is their own work list, not the clinic's figures, so it has its own tour. */
const DOCTOR_HOME_TOUR: GuideTour = {
  id: 'clinician.page.doctor-home.v1',
  title: 'Dashboard',
  steps: [
    header('Your day at a glance', 'Everything waiting for you, in one place. Every number is live.'),
    { target: 'dashboard:work', title: 'Waiting for you', body: 'Urgent appointments and side effects first, then consultations, missed doses, messages, tickets and supplies. Each opens the page where you deal with it.' },
  ],
};

export function pageTourFor(pathname: string, role?: string | null): GuideTour | null {
  if (pathname === '/' && role === 'DOCTOR') return DOCTOR_HOME_TOUR;
  if (PAGE_TOURS[pathname]) return PAGE_TOURS[pathname];
  if (pathname.startsWith('/consultation/')) return PAGE_TOURS['/consultation'];
  return null;
}
