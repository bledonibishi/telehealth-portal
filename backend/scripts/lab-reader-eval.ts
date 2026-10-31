/**
 * Tests the lab report reader (src/labs/lab-reader.service.ts) on made-up reports with known answers
 * (src/labs/lab-eval-cases.ts). Each report is printed as a PDF in memory, read by the real reader with the same
 * instructions it uses live, and every row is compared with the answer.
 *
 *   cd backend
 *   pnpm lab-reader-eval                     # every report, 3 times each
 *   pnpm lab-reader-eval albanian            # only the reports whose name contains "albanian"
 *   pnpm lab-reader-eval --runs 1            # once each, for a quick look
 *   pnpm lab-reader-eval --out before.json   # also save the results, to compare with a run after a change
 *
 * Each field is ok, left (nothing read: the doctor types it in) or wrong (a confident error). A wrong number, a result
 * filed under the wrong test, or a row that is not on the report is blocking: it is how a wrong value reaches a record.
 *
 * Run it before changing the reader's instructions or LAB_READER_MODEL, and after. It sends only these made-up reports to
 * the AI service named in backend/.env (about 1–2 cents a read on Sonnet). Needs ANTHROPIC_API_KEY, and "labs" in
 * AI_ENABLED_FEATURES. These reports are cleaner than real scans and photos, so the scores are optimistic.
 */
import PDFDocument from 'pdfkit';
import { LabReaderService } from '../src/labs/lab-reader.service';
import { LAB_CASES, type LabCase } from '../src/labs/lab-eval-cases';
import { scoreReading, type LabScore } from '../src/labs/lab-eval-score';
import { evalArgs, loadBackendEnv, pool, requireCases, saveResults } from './eval-utils';

/** The report as a laboratory would print it. */
function render(c: LabCase): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(18).text(c.lab.toUpperCase());
    doc.font('Helvetica').fontSize(9).fillColor('#555').text('Made-up report for testing');
    doc.moveDown(1.2).fillColor('#000').fontSize(10);
    doc.text(`${c.columns[0] === 'Analiza' ? 'Pacienti' : 'Patient'}: ${c.patient.toUpperCase()}`);
    for (const line of c.header) doc.text(line);
    doc.moveDown(1);
    const x = [50, 270, 340, 410, 510];
    let y = doc.y;
    doc.font('Helvetica-Bold');
    c.columns.forEach((h, i) => doc.text(h, x[i], y));
    y += 18;
    doc.moveTo(50, y - 4).lineTo(545, y - 4).strokeColor('#999').stroke();
    for (const row of c.rows) {
      doc.font(row[4] ? 'Helvetica-Bold' : 'Helvetica');
      row.forEach((cell, i) => doc.text(cell, x[i], y, { width: i === 0 ? 210 : 95 }));
      y += 20;
    }
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#999').stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#555').text('H = above the reference range, L = below the reference range.', 50, y + 10);
    if (c.footer) doc.moveDown(1).fontSize(8).text(c.footer);
    doc.end();
  });
}

async function main() {
  const { runs, out, filter, match } = evalArgs(3);
  loadBackendEnv();
  const reader = new LabReaderService({ get: (key: string) => process.env[key] } as any);
  if (!reader.isConfigured) {
    console.error('The lab reader is off here. Set ANTHROPIC_API_KEY and add "labs" to AI_ENABLED_FEATURES in backend/.env.');
    process.exit(1);
  }
  const cases = LAB_CASES.filter((c) => match(c.name));
  requireCases(cases.length, filter);
  console.log(`Lab reader: ${reader.model}. ${cases.length} reports, ${runs} run(s) each.\n`);

  const results = [];
  const total = { ok: 0, left: 0, wrong: 0, failed: 0 };
  for (const c of cases) {
    const pdf = await render(c);
    const reads = await pool(Array.from({ length: runs }, () => () => reader.read(pdf, 'application/pdf')));
    const scores: LabScore[] = [];
    let failed = 0;
    for (const r of reads) {
      if (r.status === 'COMPLETED') scores.push(scoreReading(c, r.reading));
      else failed += 1;
    }
    const sum = (k: 'ok' | 'left' | 'wrong') => scores.reduce((n, s) => n + s[k], 0);
    const blocking = [...new Set(scores.flatMap((s) => s.blocking))];
    const problems = [...new Set(scores.flatMap((s) => s.problems))].filter((p) => !blocking.includes(p));
    total.ok += sum('ok');
    total.left += sum('left');
    total.wrong += sum('wrong');
    total.failed += failed;
    results.push({ name: c.name, runs, failed, ok: sum('ok'), left: sum('left'), wrong: sum('wrong'), blocking, problems });
    const mark = blocking.length ? '⛔' : sum('wrong') || sum('left') || failed ? '✗' : '✓';
    console.log(`${mark} ${c.name} (ok ${sum('ok')}, left ${sum('left')}, wrong ${sum('wrong')}${failed ? `, ${failed} reads failed` : ''})`);
    for (const p of blocking) console.log(`    ⛔ ${p}`);
    for (const p of problems) console.log(`    ${p}`);
  }

  const fields = total.ok + total.left + total.wrong;
  const blocked = results.filter((r) => r.blocking.length);
  console.log(`\nFields: ${total.ok} ok, ${total.left} left to the doctor, ${total.wrong} wrong, of ${fields}.${total.failed ? ` ${total.failed} reads failed outright (check these first).` : ''}`);
  if (blocked.length) console.log(`⛔ A wrong number would have reached a record in: ${blocked.map((r) => r.name).join('; ')}. Do not use this version.`);
  else if (total.failed) console.log('Some reads failed outright, so this run proves nothing yet: fix those first.');
  else if (total.wrong) console.log('No wrong numbers, but some ranges, flags or dates were wrong. Worth a look.');
  else console.log('Nothing wrong. Push "left" down next.');

  saveResults(out, { model: reader.model, runs, total, results });
  process.exit(blocked.length || total.failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
