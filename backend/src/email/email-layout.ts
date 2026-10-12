export const BRAND_NAME = 'Omopharmacy';

/** Patient-supplied text (names) ends up in HTML emails: escape it so a name can't inject markup. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** An amount in the currency's smallest unit (cents) as the patient reads it, e.g. €20.00. */
export function formatMoney(minorUnits: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(minorUnits / 100);
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** Who the email is for: it decides the wording of the footer. */
export type Audience = 'patient' | 'staff' | 'partner';

const FOOTER: Record<Audience, string> = {
  patient: `${BRAND_NAME} · Prescription treatment, reviewed by a licensed clinician<br>This is an automated message, so please don’t reply. You can message your care team from your portal.`,
  staff: `${BRAND_NAME} clinic portal · You’re receiving this because an administrator added you to the team.`,
  partner: `${BRAND_NAME} · Automated order notice for our pharmacy partners.`,
};

const FONT = 'Arial,Helvetica,sans-serif';
const TONES = {
  info: { bg: '#EEF4FF', border: '#C9D9FB', text: '#1E4FD8' },
  success: { bg: '#ECFDF3', border: '#A7E3BF', text: '#15803D' },
  warning: { bg: '#FFF7E6', border: '#F5D58A', text: '#B45309' },
  danger: { bg: '#FEF2F2', border: '#F5B5B5', text: '#B91C1C' },
} as const;
export type Tone = keyof typeof TONES;

/** A title. The text is escaped here. */
export const heading = (text: string) =>
  `<h1 style="margin:0 0 12px;font:800 24px/1.25 ${FONT};letter-spacing:-0.4px;color:#0E1A2B">${escapeHtml(text)}</h1>`;

/** A paragraph. `html` is trusted: the caller has escaped anything a person typed. */
export const paragraph = (html: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#475569">${html}</p>`;

/** Small grey print inside the card. Same rule as `paragraph`. */
export const smallPrint = (html: string) => `<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#64748B">${html}</p>`;

/** A coloured box for the one thing the email is about. `html` is trusted. */
export const callout = (html: string, tone: Tone = 'info') => {
  const t = TONES[tone];
  return `<div style="margin:0 0 20px;padding:16px 18px;background:${t.bg};border:1px solid ${t.border};border-radius:12px;font-size:15px;line-height:1.7;color:${t.text}">${html}</div>`;
};

/** The one number an email is about (a reward, a refund), big and centred. `value` is escaped here; `caption` is trusted. */
export const hero = (value: string, caption: string, tone: Tone = 'success') => {
  const t = TONES[tone];
  return `<div style="margin:8px 0 24px;padding:28px 20px;background:${t.bg};border:1px solid ${t.border};border-radius:16px;text-align:center"><div style="font:800 52px/1.1 ${FONT};letter-spacing:-1px;color:${t.text}">${escapeHtml(value)}</div><div style="margin-top:10px;font-size:15px;line-height:1.5;color:${t.text}">${caption}</div></div>`;
};

/** The big code of a verification email. */
export const codeBox = (code: string) =>
  `<div style="margin:0 0 20px;background:#EEF4FF;border:1px solid #C9D9FB;border-radius:12px;padding:20px;text-align:center"><span style="font:800 36px/1 'Courier New',monospace;letter-spacing:10px;color:#1E4FD8">${escapeHtml(code)}</span></div>`;

/** Label and value rows (courier, tracking number…). Labels are ours; values are escaped here. */
export const detailRows = (rows: Array<[label: string, value: string]>) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-top:1px solid #E6ECF5">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #E6ECF5;font-size:14px;color:#64748B">${label}</td><td style="padding:10px 0;border-bottom:1px solid #E6ECF5;font-size:14px;font-weight:700;color:#0E1A2B;text-align:right">${escapeHtml(value)}</td></tr>`,
    )
    .join('')}</table>`;

/** A button with the plain link under it, for mail apps that block buttons. */
export function button(label: string, url: string) {
  const href = escapeHtml(url);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px"><tr><td style="background:#1E4FD8;border-radius:10px">` +
    `<a href="${href}" style="display:inline-block;padding:14px 28px;font:700 16px ${FONT};color:#FFFFFF;text-decoration:none">${escapeHtml(label)}</a>` +
    `</td></tr></table>` +
    `<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#94A3B8;word-break:break-all">Button not working? Copy this link into your browser:<br><a href="${href}" style="color:#64748B">${href}</a></p>`
  );
}

interface LayoutOptions {
  /** The grey line some mail apps show next to the subject. */
  preheader: string;
  /** Trusted HTML for the card: built from the helpers above, or escaped by the caller. */
  body: string;
  /** Small print under the card, e.g. why the person got this email. */
  note?: string;
  audience?: Audience;
}

/**
 * The shared look of every email: the brand at the top, a white card, a footer. Tables and inline styles only,
 * because mail apps ignore most CSS; the colours are the website's, and the light scheme is forced so a dark-mode
 * mail app doesn't invert it.
 */
export function emailLayout({ preheader, body, note, audience = 'patient' }: LayoutOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#F4F7FB">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FB">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${audience === 'partner' ? 640 : 520}px">
        <tr><td style="padding:0 4px 20px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:36px;height:36px;background:#1E4FD8;border-radius:10px;text-align:center;vertical-align:middle;font:800 18px/36px ${FONT};color:#FFFFFF">O</td>
            <td style="padding-left:10px;font:800 20px ${FONT};letter-spacing:-0.3px;color:#0E1A2B">${BRAND_NAME}</td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#FFFFFF;border:1px solid #E6ECF5;border-radius:16px;padding:32px 28px;font-family:${FONT};color:#0E1A2B">
          ${body}
        </td></tr>
        <tr><td style="padding:20px 8px 0;font:12px/1.7 ${FONT};color:#7A8699;text-align:center">
          ${note ? `${note}<br><br>` : ''}${FOOTER[audience]}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** A plain-text copy of an HTML email. Sent alongside it: some mail apps show only that, and spam filters like having it. */
export function toText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<td style="width:36px[\s\S]*?<\/td>/i, '')
    .replace(/<div style="display:none[\s\S]*?<\/div>/gi, '')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => (label.replace(/<[^>]+>/g, '').trim() === href ? href : `${label.replace(/<[^>]+>/g, '').trim()} (${href})`))
    .replace(/<\/(p|h1|h2|div|tr|table)>|<br\s*\/?>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ')
    .trim();
}
