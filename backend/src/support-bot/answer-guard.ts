/** Wording an answer must not have: a promise of action by "us" or "the team", or a request for personal details. */
const PROMISE = /\b(we|i)(?:'ll|’ll| will| can| shall)\s+(?:\w+\s+){0,2}?(make sure|send|resend|issue|refund|reset|fix|sort|arrange|reply with|get back)\b/i;
const ASKS_FOR_DETAILS = /\b(?:reply with|send (?:me|us)|give (?:me|us)|share|type|tell (?:me|us)|provide|write)\b[^.?!]{0,30}\b(?:your|the)\s+(?:\w+\s+)?(?:e-?mail(?: address)?|password|passcode|card (?:number|details)|id (?:card|document)|passport)\b/i;
export const overpromises = (answer: string) => PROMISE.test(answer) || ASKS_FOR_DETAILS.test(answer);
