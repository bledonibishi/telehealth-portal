/**
 * Writes every email to backend/email-previews/ as an HTML file, with believable sample data, to open in a browser.
 * Nothing is sent. Run: npm run email-preview
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SAMPLES } from '../src/email/templates/samples';

const dir = join(__dirname, '..', 'email-previews');
mkdirSync(dir, { recursive: true });
for (const { name, content } of SAMPLES) writeFileSync(join(dir, `${name}.html`), content.html);
writeFileSync(
  join(dir, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Email previews</title><body style="font-family:sans-serif;max-width:640px;margin:40px auto"><h1>Email previews</h1><ul>${SAMPLES.map((s) => `<li><a href="${s.name}.html">${s.name}</a> — ${s.content.subject.replace(/</g, '&lt;')}</li>`).join('')}</ul>`,
);
console.log(`Wrote ${SAMPLES.length} emails to ${dir}/index.html`);
