import type { GuideTour } from '@telehealth/guide';

// The guide's tours for the patient portal. A step whose target is not on screen is skipped, so the same tour works with
// the sidebar (computer) and the bottom menu (phone), and for every programme (the weight journey is GLP-1 only).
// Targets are `data-guide` attributes; `nav:/path` is a menu link. Change a tour's id (v1 → v2) when you rewrite it.

export const WELCOME_TOUR: GuideTour = {
  id: 'web.welcome.v1',
  title: 'Tour of your portal',
  steps: [
    { title: 'Welcome to your portal', body: 'This guide shows you around, one part at a time. Use Next and Back, or the arrow keys. Esc closes it.' },
    { target: 'nav:/dashboard', title: 'Home', body: 'Your day at a glance: your next dose, your progress, and any news from your care team.' },
    { target: 'nav:/treatment-plan', title: 'My treatment', body: 'Your medicine, your schedule and your next supply. Order the next one early from here.' },
    { target: 'nav:/weight-journey', title: 'Weight journey', body: 'Your weigh-ins, photos and measurements over time.' },
    { target: 'nav:/doses', title: 'Dose calendar', body: 'When each dose is due. Mark the ones you’ve taken so your doctor can see how it’s going.' },
    { target: 'nav:/symptoms', title: 'Symptoms', body: 'Score how you feel, so your doctor can see your symptoms change over time.' },
    { target: 'nav:/appointments', title: 'Appointments', body: 'Ask to see a doctor about a check-up, a side effect or anything worrying you.' },
    { target: 'nav:/care-team', title: 'My doctor', body: 'The clinicians looking after your treatment.' },
    { target: 'nav:/orders', title: 'Orders', body: 'Your deliveries and where each one is right now.' },
    { target: 'nav:/prescription', title: 'Prescriptions', body: 'Everything your doctor has prescribed for you.' },
    { target: 'nav:/documents', title: 'Documents', body: 'Your prescriptions, check-in reports, lab results and invoices, ready to download.' },
    { target: 'nav:/messages', title: 'Help & messages', body: 'Chat with your care team, or send a written request about a payment, a delivery or your account.' },
    { target: 'nav-more', title: 'More', body: 'The rest of the menu: appointments, your doctor, orders, prescriptions and documents.' },
    { target: 'notifications', title: 'Notifications', body: 'Replies from your doctor, decisions and order updates appear here.' },
    { target: 'account-menu', title: 'Your account', body: 'Your profile, settings and sign out. You can turn this guide off any time in Settings.' },
  ],
};

const header = (title: string, body: string) => ({ target: 'page-header', title, body });

const PAGE_TOURS: Record<string, GuideTour> = {
  '/dashboard': {
    id: 'web.page.dashboard.v1',
    title: 'Home',
    steps: [
      header('Your home screen', 'Everything about your treatment at a glance.'),
      { target: 'dashboard:today', title: 'Today', body: 'Your next dose and your monthly check-in.' },
      { target: 'dashboard:progress', title: 'Progress at a glance', body: 'Your weight, doses and next steps in a row of small tiles.' },
      { target: 'dashboard:plan', title: 'Your treatment plan', body: 'Your medicine and what comes next.' },
      { target: 'dashboard:updates', title: 'Recent updates', body: 'Replies, decisions and order news from your care team.' },
      { target: 'dashboard:orders', title: 'Recent orders', body: 'Your latest deliveries and their tracking.' },
      { target: 'dashboard:chat', title: 'Chat with us', body: 'A shortcut to your messages.' },
      { target: 'dashboard:emergency', title: 'In an emergency', body: 'What to do if you feel very unwell. Always call the emergency number first.' },
      { target: 'dashboard:side-effect', title: 'Report a side effect', body: 'Tell your doctor straight away if something doesn’t feel right.' },
      { target: 'dashboard:customize', title: 'Make it yours', body: 'Move, resize, hide or add cards so your home screen shows what matters to you.' },
    ],
  },
  '/treatment-plan': {
    id: 'web.page.treatment.v1',
    title: 'My treatment',
    steps: [
      header('Your treatment', 'Your medicine, your schedule and your next supply.'),
      { target: 'treatment:supply', title: 'This supply', body: 'How much of this supply you’ve used. Order the next one a few days before it runs out.' },
      { target: 'treatment:next', title: 'Upcoming doses', body: 'Your next doses. The dose calendar has them all.' },
      { target: 'treatment:side-effects', title: 'Side effects', body: 'Your weekly check, and what you’ve reported to your doctor.' },
      { target: 'treatment:details', title: 'Plan details', body: 'Your programme, medicine and current dose.' },
    ],
  },
  '/weight-journey': {
    id: 'web.page.weight.v1',
    title: 'Weight journey',
    steps: [header('Your weight journey', 'Your weigh-ins and photos over time, your milestones, and your body measurements.')],
  },
  '/doses': {
    id: 'web.page.doses.v1',
    title: 'Dose calendar',
    steps: [header('Your dose calendar', 'When each dose is due and what you’ve taken. Click a dose to mark it taken or skipped.')],
  },
  '/messages': {
    id: 'web.page.messages.v1',
    title: 'Help & messages',
    steps: [
      { target: 'messages:chat', title: 'Chat with us', body: 'Write to your care team here. You get a reply in the chat and a notification.' },
      { target: 'messages:request', title: 'Something specific?', body: 'Send a written request about a payment, a delivery, your account or a question for your doctor, with a photo if it helps.' },
    ],
  },
  '/appointments': {
    id: 'web.page.appointments.v1',
    title: 'Appointments',
    steps: [
      header('See a doctor', 'For a check-up, a side effect or anything worrying you. Not for emergencies.'),
      { target: 'appointments:book', title: 'Book an appointment', body: 'Say what it is about and how urgent it is. Urgent requests get a reply within 24 hours.' },
      { target: 'appointments:requests', title: 'Your requests', body: 'What you’ve asked for and the time your doctor gave you.' },
    ],
  },
  '/orders': {
    id: 'web.page.orders.v1',
    title: 'Orders',
    steps: [header('Your deliveries', 'Where each order is, with tracking. Running low? Order your next supply early from here.')],
  },
  '/care-team': {
    id: 'web.page.care-team.v1',
    title: 'My doctor',
    steps: [header('Your care team', 'The doctor leading your treatment, the rest of the team, and your recent appointments.')],
  },
  '/prescription': {
    id: 'web.page.prescription.v1',
    title: 'Prescriptions',
    steps: [header('Your prescriptions', 'Everything your doctor has prescribed. The PDF of each one is under Documents.')],
  },
  '/documents': {
    id: 'web.page.documents.v1',
    title: 'Documents',
    steps: [header('Your documents', 'Check-in reports, prescriptions, lab results and invoices, all in one place.')],
  },
  '/settings': {
    id: 'web.page.settings.v1',
    title: 'Settings',
    steps: [
      header('Settings', 'Your subscription, notifications, password and privacy.'),
      { target: 'settings:guide', title: 'The guide', body: 'Turn this guide on or off here. While it is on, each page explains itself the first time you open it, and the Guide button replays any tour.' },
    ],
  },
};

export const pageTourFor = (pathname: string): GuideTour | null => PAGE_TOURS[pathname] ?? null;
