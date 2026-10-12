/**
 * Dev only: makes a made-up lab report (a PDF) to try the lab-report features with: sending it in as a patient, attaching
 * it as a doctor, and having the AI reader list its results.
 *
 *   cd backend
 *   pnpm sample-lab-report "Bledon Ibishi"             # a report in that patient's name  -> ~/Downloads/sample-lab-report.pdf
 *   pnpm sample-lab-report "Someone Else" --out x.pdf  # for a different name, to see the "wrong patient" warning
 *
 * Everything on it is invented. Nothing is uploaded or sent anywhere by this script.
 */
import { createWriteStream } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import PDFDocument from 'pdfkit';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = resolve(outIndex >= 0 ? args[outIndex + 1] : `${homedir()}/Downloads/sample-lab-report.pdf`);
const outValueIndex = outIndex >= 0 ? outIndex + 1 : -1;
const name = args.find((a, i) => !a.startsWith('--') && i !== outValueIndex) ?? 'Alma Demo';

const day = (ago: number) => {
  const d = new Date(Date.now() - ago * 86_400_000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// test, result, unit, reference range, flag
const ROWS: Array<[string, string, string, string, string]> = [
  ['Estradiol (E2)', '812', 'pmol/L', '100 - 700', 'H'],
  ['Follicle stimulating hormone (FSH)', '46.2', 'IU/L', '25.8 - 134.8', ''],
  ['Luteinising hormone (LH)', '31.9', 'IU/L', '7.7 - 58.5', ''],
  ['Sex hormone binding globulin (SHBG)', '61', 'nmol/L', '18 - 144', ''],
  ['Vitamin D (25-OH)', '41', 'nmol/L', '50 - 125', 'L'],
  ['Haematocrit', '0.41', 'L/L', '0.36 - 0.46', ''],
  ['Alanine aminotransferase (ALT)', '24', 'U/L', '7 - 56', ''],
];

const doc = new PDFDocument({ size: 'A4', margin: 50 });
doc.pipe(createWriteStream(out));
doc.font('Helvetica-Bold').fontSize(18).text('DEMO MEDICAL LABORATORY', { align: 'left' });
doc.font('Helvetica').fontSize(9).fillColor('#555').text('Rr. Shembull 1, Prishtinë · Tel +383 38 000 000 · This is a made-up report for testing');
doc.moveDown(1.2).fillColor('#000');
doc.font('Helvetica-Bold').fontSize(12).text('LABORATORY REPORT');
doc.moveDown(0.5).font('Helvetica').fontSize(10);
doc.text(`Patient: ${name.toUpperCase()}`);
doc.text('Date of birth: 09/03/1974      Sex: F');
doc.text(`Sample collected: ${day(3)}`);
doc.text(`Report printed: ${day(1)}`);
doc.moveDown(1);

const x = [50, 270, 340, 400, 500];
const header = ['Test', 'Result', 'Unit', 'Reference range', 'Flag'];
let y = doc.y;
doc.font('Helvetica-Bold');
header.forEach((h, i) => doc.text(h, x[i], y));
y += 18;
doc.moveTo(50, y - 4).lineTo(545, y - 4).strokeColor('#999').stroke();
doc.font('Helvetica');
for (const [test, result, unit, range, flag] of ROWS) {
  doc.font(flag ? 'Helvetica-Bold' : 'Helvetica');
  [test, result, unit, range, flag].forEach((cellText, i) => doc.text(cellText, x[i], y, { width: i === 0 ? 210 : 90 }));
  y += 20;
}
doc.moveTo(50, y).lineTo(545, y).strokeColor('#999').stroke();
doc.font('Helvetica').fontSize(8).fillColor('#555').text('H = above the reference range, L = below the reference range. Reference ranges are those of this laboratory.', 50, y + 10);
doc.end();
console.log(`Made ${out}\nIn the name of: ${name}\nIt has ${ROWS.length} results: estradiol is high (H), vitamin D is low (L), the rest are in range.`);
