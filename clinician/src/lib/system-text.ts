/**
 * Texts the system itself writes into the record in English (why the assistant handed a conversation over, the notes it and
 * the quick fixes leave on a ticket). They are stored as written so the record stays as it was, and translated when shown:
 * a fixed sentence goes through t(), a sentence with a name or number in it is matched by its shape and filled in again.
 * Anything a person wrote, or that doesn't match, is shown exactly as it is.
 */
type T = (text: string, vars?: Record<string, string | number>) => string;

// Sentences with something that changes in them: the pattern finds it, the template is translated and filled in.
const PATTERNS: Array<{ re: RegExp; template: string; keys: string[] }> = [
  { re: /^The article “(.+)” did not solve it and there is nothing else to offer\.$/, template: 'The article “{title}” did not solve it and there is nothing else to offer.', keys: ['title'] },
  { re: /^The article “(.+)” needs a person to follow up\.$/, template: 'The article “{title}” needs a person to follow up.', keys: ['title'] },
  { re: /^(\d+) answers did not solve it\.$/, template: '{n} answers did not solve it.', keys: ['n'] },
  { re: /^Answer (\d+) of (\d+), from the article “(.+)”\.$/, template: 'Answer {n} of {max}, from the article “{title}”.', keys: ['n', 'max', 'title'] },
  { re: /^No reply for (\d+) hours after the answer, so the assistant closed this\. A new message from the patient reopens the conversation\.$/, template: 'No reply for {n} hours after the answer, so the assistant closed this. A new message from the patient reopens the conversation.', keys: ['n'] },
];

function translateLine(line: string, t: T): string {
  for (const p of PATTERNS) {
    const m = line.match(p.re);
    if (m) return t(p.template, Object.fromEntries(p.keys.map((k, i) => [k, m[i + 1]])));
  }
  return t(line);
}

/** A single reason or sentence the system wrote. */
export function systemText(text: string | null | undefined, t: T): string {
  if (!text) return '';
  return translateLine(text.trim(), t);
}

/** A note on a ticket: the system's own lines translated, the patient's words and anything else left alone. */
export function systemNote(body: string, t: T): string {
  const handed = body.match(/^Handed to a person: (.*)\nWhat the patient wrote last:\n([\s\S]*)$/);
  if (handed) return `${t('Handed to a person:')} ${translateLine(handed[1], t)}\n${t('What the patient wrote last:')}\n${handed[2]}`;
  const opened = body.match(/^Opened by the automated assistant for a patient message\.\n([\s\S]*)$/);
  if (opened) return `${t('Opened by the automated assistant for a patient message.')}\n${opened[1]}`;
  const engineers = body.match(/^Passed to the engineers:\n([\s\S]*)$/);
  if (engineers) return `${t('Passed to the engineers:')}\n${engineers[1]}`;
  const fix = body.match(/^(Resent the activation link|Sent a password reset link|Retried the failed payment) — (done|did not work): ([\s\S]*)\nReason: ([\s\S]*)$/);
  if (fix) return `${t(fix[1])} — ${t(fix[2] === 'done' ? 'done' : 'did not work')}: ${fix[3]}\n${t('Reason:')} ${fix[4]}`;
  return body.split('\n').map((l) => translateLine(l, t)).join('\n');
}
