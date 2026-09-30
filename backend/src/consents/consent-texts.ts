import { ConsentType } from '../common/enums';

// The wording a patient agrees to. Change the version whenever the text
// changes — each Consent row records which version was accepted. Review with
// legal counsel before go-live.
export const CURRENT_CONSENTS: Record<ConsentType, { version: string; text: string }> = {
  [ConsentType.TELEHEALTH]: {
    version: '2026-09-29',
    text: [
      'I understand that my consultation takes place online, without a physical examination.',
      'A licensed doctor will review my answers and may ask for more information, decline treatment, or prescribe.',
      'My answers are complete and truthful — prescribing decisions depend on them.',
      'For urgent or severe symptoms I will contact emergency services (112) or my own doctor rather than wait for this service.',
      'My health information is stored securely and shared only with the clinicians treating me, the pharmacy dispensing my medicine, and my own doctor if I have given their details.',
    ].join('\n'),
  },
};
