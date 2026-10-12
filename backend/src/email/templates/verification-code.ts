import { codeBox, emailLayout, heading, paragraph, smallPrint } from '../email-layout';
import type { EmailContent } from './types';

/** The six-digit code that proves someone owns the address they typed into the quiz. */
export function verificationCodeEmail(a: { code: string }): EmailContent {
  return {
    subject: `${a.code} is your verification code`,
    html: emailLayout({
      preheader: `Your code is ${a.code}. It expires in 10 minutes.`,
      body: [
        heading('Confirm your email'),
        paragraph('Enter this code to continue your assessment.'),
        codeBox(a.code),
        smallPrint('The code expires in 10 minutes. Never share it with anyone.'),
      ].join(''),
      note: 'If you didn’t ask for this code, you can safely ignore this email.',
    }),
  };
}
