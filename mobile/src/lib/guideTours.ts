import type { GuideTour } from '@telehealth/guide';

// The app guide's tours on the phone. A step whose target is not on screen is skipped, so the tour of the app fits every
// programme (the Weight tab is GLP-1 only). Targets: `tab:<route name>` is a tab (GuideTabBar), the rest are GuideTarget
// ids; `screen-header` is the title of the screen in front (Screen in ui.tsx). Change an id (v1 → v2) when you rewrite it.

export const WELCOME_TOUR: GuideTour = {
  id: 'mobile.welcome.v1',
  title: 'Tour of the app',
  steps: [
    { title: 'Welcome', body: 'This guide shows you around the app, one part at a time. Tap Next to go on, or Close to stop.' },
    { target: 'tab:Status', title: 'Home', body: 'Where your treatment stands: your next step, your medicine and your consultations.' },
    { target: 'tab:Weight', title: 'Weight', body: 'Log your weight and see your progress towards your target.' },
    { target: 'tab:Injections', title: 'Your doses', body: 'When each dose is due. Log the ones you’ve taken so your doctor can see how it’s going.' },
    { target: 'tab:Messages', title: 'Help & messages', body: 'Write to your care team, or send a request about a payment, a delivery or your account.' },
    { target: 'tab:More', title: 'More', body: 'Notifications, your doctor, orders and payments, side effects, and your account.' },
    { target: 'more:guide', title: 'The guide', body: 'Turn this guide on or off here. While it is on, each screen explains itself the first time you open it, and the Guide button replays any tour.' },
  ],
};

export const HOME_TOUR: GuideTour = {
  id: 'mobile.screen.home.v1',
  title: 'Home',
  steps: [
    { target: 'screen-header', title: 'Your home screen', body: 'How your treatment is going, at a glance.' },
    { target: 'home:next', title: 'Your next step', body: 'What happens next in your treatment, and what to do if it is up to you.' },
    { target: 'home:plan', title: 'Your medicine', body: 'What you’re taking, when your next dose is due and how many repeats are left.' },
  ],
};

export const WEIGHT_TOUR: GuideTour = {
  id: 'mobile.screen.weight.v1',
  title: 'Weight',
  steps: [{ target: 'screen-header', title: 'Your weight journey', body: 'Log your weight, change your target and see your weigh-ins over the last 3 months.' }],
};

export const DOSES_TOUR: GuideTour = {
  id: 'mobile.screen.doses.v1',
  title: 'Your doses',
  steps: [{ target: 'screen-header', title: 'Your dose calendar', body: 'When each dose is due. Tap a day with a dose to log it, and do the weekly side-effect check.' }],
};

export const MESSAGES_TOUR: GuideTour = {
  id: 'mobile.screen.messages.v1',
  title: 'Help & messages',
  steps: [
    { target: 'screen-header', title: 'Chat with your care team', body: 'Only you and our team can read this. You get a notification when we reply.' },
    { target: 'messages:request', title: 'Send a request', body: 'For something specific: a payment, a delivery, your account or a question for your doctor, with a photo if it helps.' },
  ],
};

export const MORE_TOUR: GuideTour = {
  id: 'mobile.screen.more.v1',
  title: 'More',
  steps: [{ target: 'screen-header', title: 'Everything else', body: 'Notifications, your doctor, orders and payments, side effects, reports and your account.' }],
};
