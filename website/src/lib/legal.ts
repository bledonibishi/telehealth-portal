import type { Lang } from './i18n';

/**
 * DRAFT legal text, written from what the system actually does (what it collects, who processes it). It has NOT been reviewed
 * by a lawyer. Anything in [[double brackets]] is something only the company or its lawyer can supply, and shows highlighted.
 * While LEGAL_REVIEWED is false the pages say they are a draft and ask search engines not to index them; once counsel has
 * approved the text and the brackets are filled in, set it to true.
 */
export const LEGAL_REVIEWED = false;

export interface Section { h: string; p?: string[]; ul?: string[] }
export interface Doc { title: string; intro?: string; sections: Section[] }

interface Pack {
  updated: string;
  updatedLabel: string;
  draft: string;
  privacy: Doc;
  terms: Doc;
  cookies: Doc;
  cookieSettings: string;
}

const EN: Pack = {
  updated: '[[date]]',
  updatedLabel: 'Last updated',
  draft: 'Draft for legal review. This text has not yet been approved by a lawyer and some details (in highlighted brackets) are still to be filled in.',
  cookieSettings: 'Change my cookie choice',
  privacy: {
    title: 'Privacy Policy',
    intro: 'This policy explains what personal data Omo Pharmacy collects when you use our website and patient app, why, who sees it, and what rights you have. Much of it is health information, which we treat as especially sensitive.',
    sections: [
      { h: '1. Who we are', p: ['The controller of your data is [[full legal name of the company]], registered in [[city, Kosovo]] under number [[registration number]], address [[address]]. You can reach us about your data at [[privacy contact email]].'] },
      { h: '2. What we collect', ul: [
        'Contact details: your name, email address, phone number and delivery address.',
        'Health information: your answers to the assessment and medical questionnaire, your height, weight and measurements, symptoms, medicines, test results you upload, and check-ins.',
        'Identity information: a photo of your ID, a selfie or the results of an identity check, your date of birth, and, where needed, proof of earlier treatment and full-body photos.',
        'Your communication with us: messages to your care team and to our support, and appointment requests.',
        'Orders and payments: what was prescribed and dispatched, delivery details, and payment status. We do not store your full card number; payments are handled by our payment provider.',
        'Technical information: your device, browser and the pages you use, and, only if you agree, analytics about how the site is used.',
      ] },
      { h: '3. Why we use it', ul: [
        'To assess whether treatment is suitable for you, issue and dispense a prescription and deliver it. Our legal basis is providing the service you asked for and, for health data, your explicit consent.',
        'To check your identity and prevent fraud and unsafe prescribing.',
        'To keep you safe: reminders, check-ins and alerts about possible side effects.',
        'To take payment, issue receipts and handle refunds.',
        'To run, secure and improve the service, including analytics linked to an identifier kept in your browser (only if you accept analytics cookies).',
        'To meet legal duties, such as keeping medical records.',
      ] },
      { h: '4. Who sees your data', p: ['Only the people and companies that need it:'], ul: [
        'The licensed doctors and clinical staff who review and treat you.',
        'The partner pharmacy that prepares your prescription, and the courier that delivers it: they receive what they need to dispense and deliver.',
        'Service providers that process data on our behalf, under contract: payment processing ([[payment provider(s)]]), email delivery ([[email provider]]), cloud hosting and file storage ([[hosting and storage providers]]), identity verification ([[identity verification provider]]), and analytics ([[analytics provider]], only if you consent).',
        'AI tools that help our staff, for example reading a prescription document or lab report you upload and drafting replies for support staff to check. [[Describe the safeguards and provider here once confirmed.]] A person makes every clinical decision.',
        'Authorities, when the law requires it.',
      ], },
      { h: '5. We do not sell your data', p: ['We never sell your personal data and we do not use your health information for advertising.'] },
      { h: '6. Transfers outside Kosovo', p: ['Some of our providers may process data outside Kosovo and the European Economic Area. Where they do, we rely on [[the legal safeguard used, for example standard contractual clauses]]. [[Confirm for each provider.]]'] },
      { h: '7. How long we keep it', p: ['We keep medical records for as long as the law requires ([[period]]), and other data only as long as we need it for the purposes above. Photos and documents you started to upload but never used are deleted automatically. [[Confirm the retention periods.]]'] },
      { h: '8. Your rights', p: ['You can ask us to give you a copy of your data, correct it, delete it (where the law allows), limit or object to how we use it, and move it to another provider. Where we rely on your consent, you can withdraw it at any time; this does not affect what we did before. Write to [[privacy contact email]] and we will answer within [[period]].', 'If you are not satisfied, you can complain to the data protection authority in Kosovo, the [[name of the authority]].'] },
      { h: '9. Security', p: ['Your data is encrypted in transit, files are encrypted at rest, access is limited to staff who need it and is logged. No system is perfectly secure; if something happens that puts you at risk we will tell you and the authority as the law requires.'] },
      { h: '10. Children', p: ['Our service is for adults aged 18 and over. We do not knowingly collect data from anyone younger.'] },
      { h: '11. Cookies', p: ['See our Cookie Policy for what the website stores in your browser.'] },
      { h: '12. Changes', p: ['If we change this policy in a way that matters to you, we will say so on this page and, where appropriate, by email.'] },
    ],
  },
  terms: {
    title: 'Terms of Service',
    intro: 'These terms apply when you use the Omo Pharmacy website and patient app. By creating an account or paying, you agree to them.',
    sections: [
      { h: '1. The service', p: ['Omo Pharmacy connects you with licensed doctors online. You answer a health assessment, a doctor reviews it and decides whether a prescription treatment is suitable, and a registered pharmacy dispenses it and delivers it to you. Completing the assessment or paying does not guarantee a prescription: the doctor decides, and may ask for more information or decline.'] },
      { h: '2. Who can use it', ul: ['You must be 18 or over.', 'You must live at an address in Kosovo where we deliver.', 'The service is for the treatments shown on the site (menopause hormone therapy, testosterone therapy and weight management).'] },
      { h: '3. Honest information', p: ['Your safety depends on the answers and documents you give. You agree to give complete and truthful information, to tell your doctor about changes in your health or medicines, and not to use anyone else’s identity or documents.'] },
      { h: '4. Not an emergency service', p: ['This is not an emergency service. If you have severe symptoms or think you are having a medical emergency, call 112 or go to the nearest emergency department. Do not wait for a message from us.'] },
      { h: '5. Treatment and your responsibilities', p: ['Follow the doctor’s and pharmacy’s instructions, complete your check-ins, and report side effects. Medicines are for you only and must not be shared.'] },
      { h: '6. Prices, payment and refunds', p: ['Prices are shown before you pay. [[Describe how payment works: per supply or subscription, when you are charged, and how to cancel.]] [[Describe the refund rules, including what happens if the doctor declines treatment or a delivery fails.]]'] },
      { h: '7. Delivery', p: ['Delivery within Kosovo is free. [[Delivery times, what happens if nobody is at the address, and cold-chain handling.]]'] },
      { h: '8. Your account', p: ['Keep your password private and tell us at once if you think someone else has used your account. You are responsible for what happens under it.'] },
      { h: '9. Acceptable use', p: ['Do not misuse the service, try to break or overload it, or use it to harass our staff.'] },
      { h: '10. Our responsibility', p: ['We take reasonable care in providing the service. Nothing in these terms limits liability that the law does not allow to be limited, including for death or personal injury caused by negligence. [[Further limitation of liability, to be set by the company’s lawyer.]]'] },
      { h: '11. Changes and ending', p: ['We may update these terms and will tell you about changes that matter. You can close your account at any time; we may suspend it if these terms are broken or for your safety.'] },
      { h: '12. Law and disputes', p: ['These terms are governed by the laws of Kosovo. [[Court or dispute resolution body.]] You can also contact [[consumer protection authority]].'] },
      { h: '13. Contact', p: ['[[Company name, address and email.]]'] },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    intro: 'Cookies and similar storage are small pieces of data a website keeps in your browser. This page says which ones we use.',
    sections: [
      { h: 'What is always on (necessary)', ul: [
        'Your progress through the assessment and checkout, so you can come back to it.',
        'Your choice on this banner, and the language you picked.',
        'A referral code, if you arrived from a friend’s link, so the discount can be applied.',
      ], p: ['These are needed for the service to work and do not track you across other sites.'] },
      { h: 'What runs only if you accept (analytics)', ul: ['Our analytics tool ([[analytics provider]]) records which pages are visited and where visitors stop in the assessment, so we can fix problems and improve the service. It sets cookies and stores an identifier in your browser.'], p: ['If you choose “Only the necessary”, analytics does not run.'] },
      { h: 'Changing your mind', p: ['You can change your choice at any time with the button below, or by clearing this site’s data in your browser settings.'] },
      { h: 'Contact', p: ['Questions about cookies: [[privacy contact email]].'] },
    ],
  },
};

const SQ: Pack = {
  updated: '[[data]]',
  updatedLabel: 'Përditësuar së fundi',
  draft: 'Draft për shqyrtim ligjor. Ky tekst ende nuk është miratuar nga një jurist dhe disa detaje (në kllapa të theksuara) duhen plotësuar.',
  cookieSettings: 'Ndrysho zgjedhjen time për cookies',
  privacy: {
    title: 'Politika e privatësisë',
    intro: 'Kjo politikë shpjegon çfarë të dhënash personale mbledh Omo Pharmacy kur përdorni faqen tonë dhe aplikacionin e pacientit, pse i mbledh, kush i sheh dhe çfarë të drejtash keni. Një pjesë e madhe janë informacione shëndetësore, që i trajtojmë si veçanërisht të ndjeshme.',
    sections: [
      { h: '1. Kush jemi', p: ['Kontrolluesi i të dhënave tuaja është [[emri i plotë ligjor i kompanisë]], i regjistruar në [[qyteti, Kosovë]] me numër [[numri i regjistrimit]], me adresë [[adresa]]. Për të dhënat tuaja na kontaktoni te [[email-i i kontaktit për privatësinë]].'] },
      { h: '2. Çfarë mbledhim', ul: [
        'Të dhëna kontakti: emri, adresa e email-it, numri i telefonit dhe adresa e dorëzimit.',
        'Informacione shëndetësore: përgjigjet tuaja në vlerësim dhe në pyetësorin mjekësor, gjatësia, pesha dhe matjet, simptomat, barnat, rezultatet e analizave që ngarkoni dhe check-in-et.',
        'Të dhëna identiteti: një foto e letërnjoftimit, një selfie ose rezultati i një verifikimi identiteti, data e lindjes dhe, kur nevojitet, dëshmi e trajtimit të mëparshëm dhe foto të trupit të plotë.',
        'Komunikimi me ne: mesazhet te ekipi juaj i kujdesit dhe te mbështetja, si dhe kërkesat për takim.',
        'Porositë dhe pagesat: çfarë është përshkruar dhe dërguar, të dhënat e dorëzimit dhe statusi i pagesës. Nuk ruajmë numrin e plotë të kartës; pagesat i trajton ofruesi ynë i pagesave.',
        'Të dhëna teknike: pajisja, shfletuesi dhe faqet që përdorni dhe, vetëm nëse pajtoheni, analitikë për përdorimin e faqes.',
      ] },
      { h: '3. Pse i përdorim', ul: [
        'Për të vlerësuar nëse trajtimi është i përshtatshëm për ju, për të lëshuar dhe furnizuar recetën dhe për ta dorëzuar. Baza jonë ligjore është ofrimi i shërbimit që kërkuat dhe, për të dhënat shëndetësore, pëlqimi juaj i shprehur.',
        'Për të verifikuar identitetin tuaj dhe për të parandaluar mashtrimin dhe përshkrimin e pasigurt.',
        'Për sigurinë tuaj: kujtesa, check-in-e dhe sinjalizime për efekte anësore të mundshme.',
        'Për të marrë pagesën, për të lëshuar faturat dhe për të trajtuar rimbursimet.',
        'Për të menaxhuar, siguruar dhe përmirësuar shërbimin, përfshirë analitikë të lidhur me një identifikues të ruajtur në shfletuesin tuaj (vetëm nëse pranoni cookies për analitikë).',
        'Për të përmbushur detyrimet ligjore, si mbajtja e dosjeve mjekësore.',
      ] },
      { h: '4. Kush i sheh të dhënat tuaja', p: ['Vetëm njerëzit dhe kompanitë që kanë nevojë për to:'], ul: [
        'Mjekët e licencuar dhe stafi klinik që ju shqyrtojnë dhe ju trajtojnë.',
        'Barnatorja partnere që përgatit recetën tuaj dhe kurieri që e dorëzon: marrin vetëm atë që duhet për furnizim dhe dorëzim.',
        'Ofruesit e shërbimeve që përpunojnë të dhëna në emrin tonë, me kontratë: përpunimi i pagesave ([[ofruesi i pagesave]]), dërgimi i email-eve ([[ofruesi i email-it]]), host-imi në cloud dhe ruajtja e skedarëve ([[ofruesit e host-imit dhe ruajtjes]]), verifikimi i identitetit ([[ofruesi i verifikimit]]) dhe analitika ([[ofruesi i analitikës]], vetëm nëse pajtoheni).',
        'Mjete të inteligjencës artificiale që ndihmojnë stafin tonë, për shembull për të lexuar një dokument recete ose raport analizash që ngarkoni dhe për të hartuar përgjigje që i kontrollon stafi i mbështetjes. [[Përshkruani mbrojtjet dhe ofruesin kur të konfirmohen.]] Çdo vendim klinik e merr një person.',
        'Autoritetet, kur e kërkon ligji.',
      ] },
      { h: '5. Nuk i shesim të dhënat tuaja', p: ['Kurrë nuk i shesim të dhënat tuaja personale dhe nuk i përdorim informacionet tuaja shëndetësore për reklama.'] },
      { h: '6. Transferime jashtë Kosovës', p: ['Disa nga ofruesit tanë mund t’i përpunojnë të dhënat jashtë Kosovës dhe Zonës Ekonomike Evropiane. Kur e bëjnë, mbështetemi te [[mbrojtja ligjore e përdorur, p.sh. klauzola kontraktuale standarde]]. [[Konfirmohet për çdo ofrues.]]'] },
      { h: '7. Sa kohë i ruajmë', p: ['Dosjet mjekësore i ruajmë aq sa e kërkon ligji ([[afati]]), kurse të dhënat e tjera vetëm sa na duhen për qëllimet e mësipërme. Fotot dhe dokumentet që filluat t’i ngarkoni por nuk u përdorën kurrë fshihen automatikisht. [[Konfirmohen afatet e ruajtjes.]]'] },
      { h: '8. Të drejtat tuaja', p: ['Mund të kërkoni një kopje të të dhënave tuaja, korrigjimin, fshirjen (kur e lejon ligji), kufizimin ose kundërshtimin e përdorimit të tyre dhe transferimin te një ofrues tjetër. Kur mbështetemi te pëlqimi juaj, mund ta tërhiqni në çdo kohë; kjo nuk ndikon në atë që kemi bërë më parë. Shkruani te [[email-i i kontaktit për privatësinë]] dhe do t’ju përgjigjemi brenda [[afati]].', 'Nëse nuk jeni të kënaqur, mund të ankoheni te autoriteti i mbrojtjes së të dhënave në Kosovë, [[emri i autoritetit]].'] },
      { h: '9. Siguria', p: ['Të dhënat tuaja enkriptohen gjatë transmetimit, skedarët enkriptohen kur ruhen, qasja kufizohet te stafi që ka nevojë dhe regjistrohet. Asnjë sistem nuk është plotësisht i sigurt; nëse ndodh diçka që ju vë në rrezik, do t’ju njoftojmë ju dhe autoritetin sipas kërkesës së ligjit.'] },
      { h: '10. Fëmijët', p: ['Shërbimi ynë është për të rritur 18 vjeç e lart. Nuk mbledhim me dije të dhëna nga persona më të rinj.'] },
      { h: '11. Cookies', p: ['Shihni Politikën tonë të cookies për atë që ruan faqja në shfletuesin tuaj.'] },
      { h: '12. Ndryshime', p: ['Nëse e ndryshojmë këtë politikë në mënyrë që ka rëndësi për ju, do ta themi në këtë faqe dhe, kur është e përshtatshme, me email.'] },
    ],
  },
  terms: {
    title: 'Kushtet e shërbimit',
    intro: 'Këto kushte vlejnë kur përdorni faqen dhe aplikacionin e pacientit të Omo Pharmacy. Duke krijuar një llogari ose duke paguar, ju i pranoni.',
    sections: [
      { h: '1. Shërbimi', p: ['Omo Pharmacy ju lidh online me mjekë të licencuar. Plotësoni një vlerësim shëndetësor, një mjek e shqyrton dhe vendos nëse një trajtim me recetë është i përshtatshëm, dhe një barnatore e regjistruar e furnizon dhe e dorëzon te ju. Plotësimi i vlerësimit ose pagesa nuk garanton një recetë: vendos mjeku dhe mund të kërkojë informacion shtesë ose ta refuzojë.'] },
      { h: '2. Kush mund ta përdorë', ul: ['Duhet të jeni 18 vjeç e lart.', 'Duhet të jetoni në një adresë në Kosovë ku dorëzojmë.', 'Shërbimi është për trajtimet e treguara në faqe (terapia hormonale e menopauzës, terapia e testosteronit dhe menaxhimi i peshës).'] },
      { h: '3. Informacion i ndershëm', p: ['Siguria juaj varet nga përgjigjet dhe dokumentet që jepni. Pajtoheni të jepni informacion të plotë dhe të vërtetë, t’i tregoni mjekut për ndryshimet në shëndetin ose barnat tuaja dhe të mos përdorni identitetin ose dokumentet e dikujt tjetër.'] },
      { h: '4. Nuk është shërbim urgjence', p: ['Ky nuk është shërbim urgjence. Nëse keni simptoma të rënda ose mendoni se keni një urgjencë mjekësore, telefononi 112 ose shkoni në urgjencën më të afërt. Mos prisni mesazh nga ne.'] },
      { h: '5. Trajtimi dhe përgjegjësitë tuaja', p: ['Ndiqni udhëzimet e mjekut dhe të barnatores, plotësoni check-in-et dhe raportoni efektet anësore. Barnat janë vetëm për ju dhe nuk duhen ndarë me të tjerë.'] },
      { h: '6. Çmimet, pagesa dhe rimbursimet', p: ['Çmimet shfaqen para se të paguani. [[Përshkruani si funksionon pagesa: për furnizim ose abonim, kur ngarkoheni dhe si anulohet.]] [[Përshkruani rregullat e rimbursimit, përfshirë çfarë ndodh nëse mjeku e refuzon trajtimin ose dorëzimi dështon.]]'] },
      { h: '7. Dorëzimi', p: ['Dorëzimi brenda Kosovës është falas. [[Afatet e dorëzimit, çfarë ndodh nëse nuk ka njeri në adresë dhe trajtimi i zinxhirit të ftohtë.]]'] },
      { h: '8. Llogaria juaj', p: ['Mbajeni fjalëkalimin privat dhe na njoftoni menjëherë nëse mendoni se dikush tjetër e ka përdorur llogarinë tuaj. Jeni përgjegjës për çka ndodh me të.'] },
      { h: '9. Përdorimi i pranueshëm', p: ['Mos e keqpërdorni shërbimin, mos u përpiqni ta prishni ose ta mbingarkoni dhe mos e përdorni për të ngacmuar stafin tonë.'] },
      { h: '10. Përgjegjësia jonë', p: ['Ofrojmë shërbimin me kujdes të arsyeshëm. Asgjë në këto kushte nuk kufizon përgjegjësinë që ligji nuk lejon ta kufizojë, përfshirë për vdekje ose lëndim të shkaktuar nga pakujdesia. [[Kufizim shtesë i përgjegjësisë, që e cakton juristi i kompanisë.]]'] },
      { h: '11. Ndryshime dhe përfundim', p: ['Mund t’i përditësojmë këto kushte dhe do t’ju njoftojmë për ndryshimet që kanë rëndësi. Mund ta mbyllni llogarinë në çdo kohë; ne mund ta pezullojmë nëse shkelen këto kushte ose për sigurinë tuaj.'] },
      { h: '12. Ligji dhe mosmarrëveshjet', p: ['Këto kushte rregullohen nga ligjet e Kosovës. [[Gjykata ose organi i zgjidhjes së mosmarrëveshjeve.]] Mund të kontaktoni edhe [[autoriteti i mbrojtjes së konsumatorit]].'] },
      { h: '13. Kontakti', p: ['[[Emri i kompanisë, adresa dhe email-i.]]'] },
    ],
  },
  cookies: {
    title: 'Politika e cookies',
    intro: 'Cookies dhe ruajtja e ngjashme janë pjesë të vogla të dhënash që një faqe i mban në shfletuesin tuaj. Kjo faqe tregon cilat përdorim ne.',
    sections: [
      { h: 'Çfarë është gjithmonë aktive (të nevojshmet)', ul: [
        'Përparimi juaj në vlerësim dhe në pagesë, që të mund të ktheheni.',
        'Zgjedhja juaj te ky banner dhe gjuha që zgjodhët.',
        'Një kod referimi, nëse erdhët nga lidhja e një miku, që të zbatohet zbritja.',
      ], p: ['Këto nevojiten që shërbimi të funksionojë dhe nuk ju ndjekin nëpër faqe të tjera.'] },
      { h: 'Çfarë nis vetëm nëse pranoni (analitika)', ul: ['Mjeti ynë i analitikës ([[ofruesi i analitikës]]) regjistron cilat faqe vizitohen dhe ku ndalen vizitorët në vlerësim, që t’i rregullojmë problemet dhe ta përmirësojmë shërbimin. Vendos cookies dhe ruan një identifikues në shfletuesin tuaj.'], p: ['Nëse zgjidhni “Vetëm ato të nevojshmet”, analitika nuk nis.'] },
      { h: 'Nëse ndryshoni mendje', p: ['Mund ta ndryshoni zgjedhjen në çdo kohë me butonin më poshtë, ose duke pastruar të dhënat e kësaj faqe te cilësimet e shfletuesit.'] },
      { h: 'Kontakti', p: ['Pyetje për cookies: [[email-i i kontaktit për privatësinë]].'] },
    ],
  },
};

export const LEGAL: Record<Lang, Pack> = { en: EN, sq: SQ };
