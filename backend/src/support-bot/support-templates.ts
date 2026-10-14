/**
 * The assistant's fixed sentences, in the four languages patients write in. They are written by us, not by the AI, so what
 * it says at the moments that matter (handing over a health question, asking whether an answer helped) is always the same.
 * Each one says it is automated where that matters. A language we have no text for gets English.
 */
export type Language = 'sq' | 'en' | 'de' | 'es' | 'other';

type Texts = { greeting: string; didItHelp: string; glad: string; handoff: string; handoffMedical: string };

export const TEMPLATES: Record<Language, Texts> = {
  en: {
    greeting: 'Hello! I’m the clinic’s automated assistant. What can I help you with? For anything about your health or medicine I’ll pass you straight to a person.',
    didItHelp: 'Did that solve it? Reply here and tell me. If not, I’ll try again or ask a colleague to help.',
    glad: 'Glad that helped! Write here any time you need us.',
    handoff: 'I’ve passed this to our team, who will reply here as soon as they can. Thank you for your patience.',
    handoffMedical: 'I’ve passed your message to our doctors, who will reply here. If you feel very unwell, or have chest pain, trouble breathing or a severe reaction, call your local emergency number now instead of waiting.',
  },
  sq: {
    greeting: 'Përshëndetje! Jam asistenti automatik i klinikës. Me çfarë mund t’ju ndihmoj? Për çdo gjë që lidhet me shëndetin ose ilaçin tuaj do t’jua kaloj menjëherë një personi.',
    didItHelp: 'A e zgjidhi kjo problemin? Përgjigjuni këtu dhe më tregoni. Nëse jo, do të provoj përsëri ose do të kërkoj ndihmën e një kolegu.',
    glad: 'Gëzohem që ndihmoi! Na shkruani këtu sa herë që keni nevojë.',
    handoff: 'E kalova këtë te ekipi ynë, i cili do t’ju përgjigjet këtu sa më shpejt që të mundet. Faleminderit për durimin.',
    handoffMedical: 'E kalova mesazhin tuaj te mjekët tanë, të cilët do t’ju përgjigjen këtu. Nëse ndiheni shumë keq, keni dhimbje gjoksi, vështirësi në frymëmarrje ose reagim të rëndë, telefononi menjëherë numrin e urgjencës në vend që të prisni.',
  },
  de: {
    greeting: 'Hallo! Ich bin der automatische Assistent der Klinik. Wobei kann ich helfen? Bei allem, was Ihre Gesundheit oder Ihr Medikament betrifft, leite ich Sie sofort an einen Menschen weiter.',
    didItHelp: 'Hat das das Problem gelöst? Antworten Sie hier und sagen Sie es mir. Wenn nicht, versuche ich es erneut oder bitte einen Kollegen um Hilfe.',
    glad: 'Schön, dass es geholfen hat! Schreiben Sie uns hier jederzeit.',
    handoff: 'Ich habe das an unser Team weitergegeben. Es antwortet Ihnen hier so schnell wie möglich. Danke für Ihre Geduld.',
    handoffMedical: 'Ich habe Ihre Nachricht an unsere Ärzte weitergegeben, die Ihnen hier antworten. Wenn Sie sich sehr schlecht fühlen, Brustschmerzen, Atemnot oder eine schwere Reaktion haben, rufen Sie sofort den Notruf an, statt zu warten.',
  },
  es: {
    greeting: '¡Hola! Soy el asistente automático de la clínica. ¿En qué puedo ayudarte? Para cualquier cosa sobre tu salud o tu medicamento te paso enseguida con una persona.',
    didItHelp: '¿Eso lo resolvió? Responde aquí y cuéntamelo. Si no, lo intento de nuevo o pido ayuda a un compañero.',
    glad: '¡Me alegro de que ayudara! Escríbenos aquí cuando lo necesites.',
    handoff: 'He pasado esto a nuestro equipo, que te responderá aquí lo antes posible. Gracias por tu paciencia.',
    handoffMedical: 'He pasado tu mensaje a nuestros médicos, que te responderán aquí. Si te encuentras muy mal, o tienes dolor de pecho, dificultad para respirar o una reacción grave, llama ya al número de emergencias en lugar de esperar.',
  },
  other: undefined as unknown as Texts,
};
TEMPLATES.other = TEMPLATES.en;
