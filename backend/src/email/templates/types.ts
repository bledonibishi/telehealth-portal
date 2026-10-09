/** What a template makes: the subject line and the HTML. Sending, logging and the plain-text copy are the service's job. */
export interface EmailContent {
  subject: string;
  html: string;
}
