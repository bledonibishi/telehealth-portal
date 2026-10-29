/**
 * The website's own text, in English and Albanian. The home page, the header, the footer and the legal pages read from here.
 * The assessment (quiz), the medical questions, checkout and the e-mails are still English only: they are medical and legal
 * wording that needs a clinician's and a lawyer's review before it is translated.
 */
export type Lang = 'en' | 'sq';
export const LANGS: Lang[] = ['en', 'sq'];

export interface Dict {
  nav: { treatments: string; how: string; bmi: string; contact: string; switchTo: string; shop: string; shopLabel: string };
  treatments: Record<'hrt' | 'trt' | 'glp', { name: string; full: string; short: string }>;
  chooser: { button: string; title: string; englishNote: string };
  hero: { chip: string; h1a: string; h1b: string; sub: string; how: string; trust: [string, string, string]; floatTitle: string; floatLabel: string; newBadge: string; newText: string };
  features: [string, string][];
  treatmentsSection: { tag: string; h2: string; lead: string; check: string; cards: Record<'hrt' | 'glp' | 'trt', { badge: string; name: string; desc: string }> };
  how: { tag: string; h2: string; lead: string; steps: [string, string][] };
  bmi: {
    tag: string; h2: string; sub: string;
    height: string; weight: string; yourBmi: string; cta: string; small: string;
    good: string; maybe: string; low: string; noteGood: string; noteMaybe: string; noteLow: string;
  };
  contact: { tag: string; h3: string; desc: (channels: string) => string; email: string; channels: { email: string; phone: string; whatsapp: string; join: (ways: string[]) => string }; whatsappButton: string; note: string };
  footer: { tagline: string; treatments: string; company: string; how: string; contact: string; emailUs: string; rights: string; privacy: string; terms: string; cookies: string; language: string };
  consent: { text: string; accept: string; decline: string; more: string };
  meta: { title: string; description: string };
}

const EN: Dict = {
  nav: { treatments: 'Treatments', how: 'How it works', bmi: 'BMI Check', contact: 'Contact', switchTo: 'SQ', shop: 'Shop', shopLabel: 'Omo Shop: everyday health products, no prescription needed' },
  treatments: {
    hrt: { name: 'Women’s hormones', full: 'Hormone replacement therapy', short: 'Women' },
    trt: { name: 'Men’s hormones', full: 'Testosterone replacement therapy', short: 'Men' },
    glp: { name: 'Weight loss', full: 'Medical weight management', short: 'Weight' },
  },
  chooser: { button: 'Check eligibility', title: 'What would you like help with?', englishNote: '' },
  hero: {
    chip: 'Prescription healthcare online',
    h1a: 'Hormone & weight care,',
    h1b: 'from Kosovo doctors',
    sub: 'Licensed clinicians. Prescription treatment, only if your doctor decides it is right for you. Free delivery to your door. Check your eligibility in about 5 minutes.',
    how: 'How it works',
    trust: ['Licensed doctors', 'Regulated meds', 'Free delivery'],
    floatTitle: 'Doctor-reviewed',
    floatLabel: 'Every prescription',
    newBadge: 'NEW',
    newText: 'GLP-1 now available',
  },
  features: [
    ['Licensed clinicians', 'Every assessment reviewed by a practising, registered doctor in Kosovo.'],
    ['Free delivery', 'Prescription medications delivered directly to your door, free of charge.'],
    ['Regulated medications', 'We only dispense branded, licensed medications — never unlicensed compounded products.'],
    ['Secure & confidential', 'Your health data is encrypted in transit and never sold.'],
  ],
  treatmentsSection: {
    tag: 'Treatments',
    h2: 'Three paths to better health',
    lead: 'We specialise in three areas of care. Whether treatment is right for you is always decided by a licensed clinician, after an assessment.',
    check: 'Check eligibility →',
    cards: {
      hrt: { badge: 'Menopause', name: 'Hormone Replacement Therapy', desc: 'Care for women experiencing menopause symptoms — hot flushes, mood changes, brain fog, low libido, and more. Your doctor decides whether treatment is appropriate for you.' },
      glp: { badge: 'Weight management', name: 'GLP-1 Weight Management', desc: 'Medical weight management for adults with a BMI of 27 or above. Your doctor decides whether treatment is appropriate for you, after reviewing your health history.' },
      trt: { badge: 'Men’s health', name: 'Low testosterone care', desc: 'For men with symptoms of low testosterone — low energy, low libido, loss of muscle and mood changes. Clinician-led assessment, and your doctor decides whether treatment is appropriate for you.' },
    },
  },
  how: {
    tag: 'How it works',
    h2: 'From questions to your door in 4 steps',
    lead: 'Simple, with every safety check in place. Have your ID and a phone camera ready for step 2.',
    steps: [
      ['Answer the health questions', 'About 5 minutes, no account needed. The doctor reads every answer.'],
      ['Pay, then finish in the app', 'We email you a link to set your password. Add your date of birth, a photo of your ID and a full-body photo.'],
      ['A doctor reviews it', 'A licensed clinician reviews everything within 24 hours of your last step and decides on your treatment.'],
      ['Delivered to your door', 'A registered pharmacy dispenses your prescription and it is delivered free to your address.'],
    ],
  },
  bmi: {
    tag: 'Quick check',
    h2: 'Could GLP-1 treatment be right for you?',
    sub: 'Move the sliders to see your BMI. It’s the first thing your doctor looks at, alongside your full medical history.',
    height: 'Height', weight: 'Weight', yourBmi: 'Your BMI', cta: 'Check my eligibility →',
    small: 'Takes about 5 minutes · Reviewed by a licensed doctor',
    good: 'In the treatment range', maybe: 'May qualify', low: 'Below the range',
    noteGood: 'A BMI of 30 or above is where GLP-1 treatment is usually considered. Your doctor will also review your age, medical history and current medication.',
    noteMaybe: 'Between 27 and 29.9, treatment may be considered if you also have a condition like type 2 diabetes or high blood pressure.',
    noteLow: 'GLP-1 treatment is generally only prescribed for a BMI of 27 or above.',
  },
  contact: {
    tag: 'Contact us',
    h3: 'We’re here to help',
    desc: (channels) => `Have questions before you start? Our team is available by ${channels}. We typically respond within a few hours on weekdays.`,
    email: 'Email',
    channels: { email: 'email', phone: 'phone', whatsapp: 'WhatsApp', join: (w) => (w.length > 1 ? `${w.slice(0, -1).join(', ')} or ${w[w.length - 1]}` : w[0]) },
    whatsappButton: 'Chat on WhatsApp',
    note: 'Omo Pharmacy operates under Kosovo healthcare regulations. All prescriptions are issued by licensed clinicians and dispensed by registered pharmacies.',
  },
  footer: {
    tagline: 'Licensed prescription healthcare for menopause, men’s health and weight management, delivered online to Kosovo.',
    treatments: 'Treatments', company: 'Company', how: 'How it works', contact: 'Contact us', emailUs: 'Email us',
    rights: 'All rights reserved.', privacy: 'Privacy Policy', terms: 'Terms of Service', cookies: 'Cookie Policy', language: 'Language',
  },
  consent: {
    text: 'We use a few cookies to remember your progress, and, only if you agree, to understand how the site is used so we can improve it.',
    accept: 'Accept', decline: 'Only the necessary', more: 'Cookie policy',
  },
  meta: {
    title: 'Omo Pharmacy – Doctor-led menopause, weight and men’s health care',
    description: 'Licensed clinicians. Prescription treatment only if your doctor decides it is right for you. Free delivery to Kosovo. Check your eligibility in about 5 minutes.',
  },
};

const SQ: Dict = {
  nav: { treatments: 'Trajtimet', how: 'Si funksionon', bmi: 'Kontrolli i BMI-së', contact: 'Kontakti', switchTo: 'EN', shop: 'Dyqani', shopLabel: 'Dyqani Omo: produkte për shëndetin e përditshëm, pa recetë' },
  treatments: {
    hrt: { name: 'Hormonet për gra', full: 'Terapia hormonale', short: 'Gra' },
    trt: { name: 'Hormonet për meshkuj', full: 'Terapia e testosteronit', short: 'Meshkuj' },
    glp: { name: 'Humbja e peshës', full: 'Menaxhimi i peshës', short: 'Pesha' },
  },
  chooser: { button: 'Kontrollo përshtatshmërinë', title: 'Me çfarë dëshironi ndihmë?', englishNote: 'Pyetësori i vlerësimit është aktualisht vetëm në anglisht.' },
  hero: {
    chip: 'Kujdes shëndetësor me recetë, online',
    h1a: 'Kujdes për hormonet dhe peshën,',
    h1b: 'nga mjekë të Kosovës',
    sub: 'Mjekë të licencuar. Trajtim me recetë, vetëm nëse mjeku juaj e çmon të përshtatshëm për ju. Dërgesë falas në derë. Kontrolloni përshtatshmërinë për rreth 5 minuta.',
    how: 'Si funksionon',
    trust: ['Mjekë të licencuar', 'Barna të rregulluara', 'Dërgesë falas'],
    floatTitle: 'Shqyrtohet nga mjeku',
    floatLabel: 'Çdo recetë',
    newBadge: 'E RE',
    newText: 'GLP-1 tani i disponueshëm',
  },
  features: [
    ['Mjekë të licencuar', 'Çdo vlerësim shqyrtohet nga një mjek i regjistruar, që ushtron në Kosovë.'],
    ['Dërgesë falas', 'Barnat me recetë dorëzohen drejtpërdrejt në derën tuaj, pa pagesë.'],
    ['Barna të rregulluara', 'Furnizojmë vetëm barna të licencuara me markë, kurrë produkte të papërcaktuara ose të përgatitura pa licencë.'],
    ['E sigurt dhe konfidenciale', 'Të dhënat tuaja shëndetësore enkriptohen gjatë transmetimit dhe nuk shiten kurrë.'],
  ],
  treatmentsSection: {
    tag: 'Trajtimet',
    h2: 'Tri rrugë drejt shëndetit më të mirë',
    lead: 'Specializohemi në tri fusha të kujdesit. Nëse trajtimi është i përshtatshëm për ju, vendos gjithmonë një mjek i licencuar, pas një vlerësimi.',
    check: 'Kontrollo përshtatshmërinë →',
    cards: {
      hrt: { badge: 'Menopauza', name: 'Terapia zëvendësuese hormonale', desc: 'Kujdes për gratë me simptoma të menopauzës: valë të nxehta, ndryshime të humorit, mjegull mendore, libido e ulët e më shumë. Mjeku juaj vendos nëse trajtimi është i përshtatshëm për ju.' },
      glp: { badge: 'Menaxhimi i peshës', name: 'Menaxhimi i peshës me GLP-1', desc: 'Menaxhim mjekësor i peshës për të rritur me BMI 27 ose më shumë. Mjeku juaj vendos nëse trajtimi është i përshtatshëm, pasi të shqyrtojë historinë tuaj shëndetësore.' },
      trt: { badge: 'Shëndeti i meshkujve', name: 'Kujdesi për testosteron të ulët', desc: 'Për meshkujt me simptoma të testosteronit të ulët: energji e ulët, libido e ulët, humbje e muskujve dhe ndryshime të humorit. Vlerësimi udhëhiqet nga mjeku, dhe mjeku vendos nëse trajtimi është i përshtatshëm për ju.' },
    },
  },
  how: {
    tag: 'Si funksionon',
    h2: 'Nga pyetjet te dera juaj, në 4 hapa',
    lead: 'E thjeshtë, me të gjitha kontrollet e sigurisë në vend. Kini gati letërnjoftimin dhe kamerën e telefonit për hapin 2.',
    steps: [
      ['Përgjigjuni pyetjeve shëndetësore', 'Rreth 5 minuta, pa pasur nevojë për llogari. Mjeku i lexon të gjitha përgjigjet.'],
      ['Paguani, pastaj përfundoni në aplikacion', 'Ju dërgojmë një lidhje për të caktuar fjalëkalimin. Shtoni datëlindjen, një foto të letërnjoftimit dhe një foto të trupit të plotë.'],
      ['Një mjek e shqyrton', 'Një mjek i licencuar shqyrton gjithçka brenda 24 orësh nga hapi juaj i fundit dhe vendos për trajtimin tuaj.'],
      ['Dorëzohet në derën tuaj', 'Një barnatore e regjistruar e përgatit recetën dhe ajo dërgohet falas në adresën tuaj.'],
    ],
  },
  bmi: {
    tag: 'Kontroll i shpejtë',
    h2: 'A mund të jetë trajtimi me GLP-1 i përshtatshëm për ju?',
    sub: 'Lëvizni rrëshqitësit për të parë BMI-në tuaj. Është gjëja e parë që shikon mjeku juaj, krahas historisë suaj të plotë mjekësore.',
    height: 'Gjatësia', weight: 'Pesha', yourBmi: 'BMI-ja juaj', cta: 'Kontrollo përshtatshmërinë →',
    small: 'Zgjat rreth 5 minuta · Shqyrtohet nga një mjek i licencuar',
    good: 'Brenda intervalit të trajtimit', maybe: 'Mund të përshtateni', low: 'Nën intervalin e trajtimit',
    noteGood: 'BMI 30 ose më e lartë është pika ku zakonisht merret në konsideratë trajtimi me GLP-1. Mjeku juaj do të shqyrtojë edhe moshën, historinë mjekësore dhe barnat që merrni aktualisht.',
    noteMaybe: 'Midis 27 dhe 29.9, trajtimi mund të merret në konsideratë nëse keni edhe një gjendje si diabeti i tipit 2 ose tensioni i lartë.',
    noteLow: 'Trajtimi me GLP-1 përshkruhet përgjithësisht vetëm për BMI 27 ose më të lartë.',
  },
  contact: {
    tag: 'Na kontaktoni',
    h3: 'Jemi këtu për t’ju ndihmuar',
    desc: (channels) => `Keni pyetje para se të filloni? Ekipi ynë është i arritshëm ${channels}. Zakonisht përgjigjemi brenda disa orëve në ditët e punës.`,
    email: 'Email',
    channels: { email: 'me email', phone: 'me telefon', whatsapp: 'në WhatsApp', join: (w) => (w.length > 1 ? `${w.slice(0, -1).join(', ')} ose ${w[w.length - 1]}` : w[0]) },
    whatsappButton: 'Shkruani në WhatsApp',
    note: 'Omo Pharmacy vepron sipas rregulloreve shëndetësore të Kosovës. Të gjitha recetat lëshohen nga mjekë të licencuar dhe furnizohen nga barnatore të regjistruara.',
  },
  footer: {
    tagline: 'Kujdes shëndetësor me recetë për menopauzën, shëndetin e meshkujve dhe menaxhimin e peshës, i dërguar online në Kosovë.',
    treatments: 'Trajtimet', company: 'Kompania', how: 'Si funksionon', contact: 'Na kontaktoni', emailUs: 'Na shkruani me email',
    rights: 'Të gjitha të drejtat e rezervuara.', privacy: 'Politika e privatësisë', terms: 'Kushtet e shërbimit', cookies: 'Politika e cookies', language: 'Gjuha',
  },
  consent: {
    text: 'Përdorim pak cookies për të mbajtur mend përparimin tuaj, dhe, vetëm nëse pajtoheni, për të kuptuar si përdoret faqja, që ta përmirësojmë.',
    accept: 'Pranoj', decline: 'Vetëm ato të nevojshmet', more: 'Politika e cookies',
  },
  meta: {
    title: 'Omo Pharmacy – Kujdes për menopauzën, peshën dhe shëndetin e meshkujve, i udhëhequr nga mjekë',
    description: 'Mjekë të licencuar. Trajtim me recetë vetëm nëse mjeku juaj e çmon të përshtatshëm. Dërgesë falas në Kosovë. Kontrolloni përshtatshmërinë për rreth 5 minuta.',
  },
};

export const DICT: Record<Lang, Dict> = { en: EN, sq: SQ };

/** The address of a page in a language: English pages live at the root, Albanian under /sq. */
export const homePath = (lang: Lang) => (lang === 'sq' ? '/sq' : '/');
export const anchor = (lang: Lang, id: string) => `${lang === 'sq' ? '/sq' : ''}/#${id}`.replace('//#', '/#');

/** The legal pages, by language. */
export const LEGAL_PATHS: Record<Lang, { privacy: string; terms: string; cookies: string }> = {
  en: { privacy: '/privacy', terms: '/terms', cookies: '/cookies' },
  sq: { privacy: '/sq/privatesia', terms: '/sq/kushtet', cookies: '/sq/cookies' },
};
