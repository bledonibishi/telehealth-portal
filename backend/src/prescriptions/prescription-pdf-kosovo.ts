import PDFDocument from 'pdfkit';
import { PrescriptionPdfInput } from './prescription-pdf';

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const WIDTH = PAGE.width - MARGIN * 2;
const BOTTOM = PAGE.height - 50;
const INK = '#111827';
const MUTED = '#4b5563';
const LINE = '#374151';
const DANGER = '#b91c1c';

const FORM_LABEL: Record<string, string> = {
  INJECTION_PEN: 'injection pen',
  INJECTION_VIAL: 'injection (vial)',
  GEL: 'gel',
  PATCH: 'patch',
  TABLET: 'tablet',
  CAPSULE: 'capsule',
  SPRAY: 'spray',
  PELLET: 'pellet',
};

const SEX: Record<string, string> = { FEMALE: 'F', MALE: 'M' };

const date = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

/**
 * The prescription laid out like the paper medicine prescription pharmacies in Kosovo are used to reading: the health
 * institution and prescriber on the left, the patient on the right, allergies, the Rp. list, then the date and the
 * prescriber's signature, with the pharmacy's own boxes left empty at the bottom. It is our own document: it carries no
 * government crest, form number or official stamp.
 */
export function renderKosovoPrescriptionPdf(rx: PrescriptionPdfInput, clinic: { name: string; address?: string }): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margins: { top: MARGIN, bottom: 24, left: MARGIN, right: MARGIN }, bufferPages: true, info: { Title: `Recetë ${rx.id}`, Author: clinic.name } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  /** A bordered box with a small bilingual caption on top and the value under it. */
  const field = (sq: string, en: string, value: string, x: number, y: number, w: number, h: number, opts: { size?: number; mono?: boolean } = {}) => {
    doc.rect(x, y, w, h).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(MUTED).text(`${sq.toUpperCase()} / ${en.toUpperCase()}`, x + 5, y + 4, { width: w - 10, lineBreak: false });
    if (value) doc.font(opts.mono ? 'Courier' : 'Helvetica').fontSize(opts.size ?? 10.5).fillColor(INK).text(value, x + 5, y + 15, { width: w - 10, height: h - 17, ellipsis: true });
  };

  // ── Title and number ──────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(17).fillColor(INK).text('RECETË PËR BARNA', MARGIN, MARGIN, { width: WIDTH * 0.65 });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Medicine prescription · electronic, issued after a remote consultation', MARGIN, doc.y + 1, { width: WIDTH * 0.65 });
  doc.font('Courier-Bold').fontSize(20).fillColor(INK).text(rx.id.slice(-8).toUpperCase(), MARGIN, MARGIN, { width: WIDTH, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor(MUTED).text('NR. I RECETËS / PRESCRIPTION NO.', MARGIN, MARGIN + 24, { width: WIDTH, align: 'right' });

  let y = MARGIN + 52;

  // ── A stop sign for anything that must not be dispensed ───────────────────
  if (rx.status !== 'ACTIVE' || rx.tampered) {
    const text = rx.tampered ? 'CONTENT CHANGED SINCE ISSUE — DO NOT DISPENSE' : `${rx.status} — DO NOT DISPENSE${rx.cancelReason ? ` (${rx.cancelReason})` : ''}`;
    doc.rect(MARGIN, y, WIDTH, 26).lineWidth(1.2).strokeColor(DANGER).stroke();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(DANGER).text(text, MARGIN, y + 8, { width: WIDTH, align: 'center' });
    y += 36;
  }

  // ── Institution and prescriber (left), patient (right) ────────────────────
  const gap = 10;
  const colW = (WIDTH - gap) / 2;
  const rx2 = MARGIN + colW + gap;
  const rowH = 38;
  const p = rx.patient;
  const address = [p.addressLine1, p.addressLine2, [p.postcode, p.city].filter(Boolean).join(' '), p.country].filter(Boolean).join(', ');

  field('Institucioni shëndetësor', 'Health institution', clinic.name, MARGIN, y, colW, rowH);
  field('Vendi', 'Place', clinic.address ?? '', MARGIN, y + rowH, colW, rowH, { size: 9 });
  field('Mjeku', 'Prescriber', rx.prescriber ? `Dr ${rx.prescriber.firstName} ${rx.prescriber.lastName}` : '—', MARGIN, y + rowH * 2, colW, rowH);
  field('Licenca e mjekut', 'Prescriber licence', [rx.prescriber?.licenseNumber, rx.prescriber?.licensingBody].filter(Boolean).join(' · ') || '—', MARGIN, y + rowH * 3, colW, rowH, { size: 9 });

  field('Emri', 'First name', p.firstName, rx2, y, colW, rowH);
  field('Mbiemri', 'Surname', p.lastName, rx2, y + rowH, colW, rowH);
  field('Data e lindjes', 'Date of birth', date(p.dateOfBirth), rx2, y + rowH * 2, colW * 0.62, rowH);
  field('Gjinia', 'Sex', SEX[p.gender ?? ''] ?? '', rx2 + colW * 0.62, y + rowH * 2, colW * 0.38, rowH);
  field('Adresa', 'Address', address, rx2, y + rowH * 3, colW, rowH, { size: 9 });
  y += rowH * 4 + gap;

  field('Alergjitë', 'Allergies', p.allergies?.trim() || '—', MARGIN, y, WIDTH, 34);
  y += 34 + gap + 4;

  // ── Rp. ───────────────────────────────────────────────────────────────────
  const rpTop = y;
  const textX = MARGIN + 74;
  const textW = WIDTH - 74 - 12;
  doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text('Rp.', MARGIN + 12, rpTop + 10, { lineBreak: false });

  const lines =
    rx.items.length > 0
      ? rx.items.map((item) => {
          const name = item.product.brandName ? `${item.product.brandName} (${item.product.name})` : item.product.name;
          const pack = item.strength.packDescription ? `${item.quantity} × ${item.strength.packDescription}` : `${item.quantity} pack${item.quantity === 1 ? '' : 's'}`;
          return { head: `${name} ${item.strength.label}`, meta: `${FORM_LABEL[item.product.form] ?? item.product.form} · ${pack}`, directions: item.directions, cold: item.product.requiresColdChain };
        })
      : [{ head: rx.medication, meta: rx.dosage, directions: rx.instructions, cold: false }];

  // The box height is worked out first so the line below it sits in the right place.
  let measure = 14;
  for (const l of lines) {
    measure += doc.font('Helvetica-Bold').fontSize(12).heightOfString(l.head, { width: textW });
    measure += doc.font('Helvetica').fontSize(9.5).heightOfString(l.meta, { width: textW }) + 2;
    measure += doc.font('Helvetica').fontSize(10.5).heightOfString(l.directions, { width: textW }) + 2;
    if (l.cold) measure += 14;
    measure += 12;
  }
  const rpH = Math.max(measure, 150);
  // A long list moves to a fresh page rather than running into the pharmacy boxes.
  const top = rpTop + rpH > BOTTOM - 150 ? MARGIN : rpTop;
  if (top !== rpTop) {
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text('Rp.', MARGIN + 12, top + 10, { lineBreak: false });
  }
  doc.rect(MARGIN, top, WIDTH, rpH).lineWidth(0.8).strokeColor(LINE).stroke();
  doc.moveTo(MARGIN + 64, top + 6).lineTo(MARGIN + 64, top + rpH - 6).lineWidth(0.8).strokeColor(LINE).stroke();

  let ly = top + 10;
  lines.forEach((l, i) => {
    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(`${i + 1}. ${l.head}`, textX, ly, { width: textW });
    ly = doc.y;
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(l.meta, textX, ly + 1, { width: textW });
    ly = doc.y + 2;
    doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(l.directions, textX, ly, { width: textW });
    ly = doc.y + 2;
    if (l.cold) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text('Cold chain: keep refrigerated (2–8 °C) and deliver same or next day.', textX, ly, { width: textW });
      ly = doc.y + 2;
    }
    ly += 10;
  });
  y = top + rpH + gap;

  // ── Date, validity and prescriber's signature ─────────────────────────────
  const sigH = 78;
  const third = (WIDTH - gap * 2) / 3;
  field('Data', 'Date issued', date(rx.issuedAt), MARGIN, y, third * 0.8, 38);
  field('E vlefshme deri', 'Valid until', rx.validUntil ? date(rx.validUntil) : '—', MARGIN, y + 38, third * 0.8, 38);
  const sx = MARGIN + third * 0.8 + gap;
  const sw = WIDTH - third * 0.8 - gap;
  doc.rect(sx, y, sw, sigH).lineWidth(0.8).strokeColor(LINE).stroke();
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(MUTED).text('NËNSHKRIMI I MJEKUT / PRESCRIBER’S SIGNATURE', sx + 5, y + 4, { width: sw - 10, lineBreak: false });
  if (rx.prescriber) {
    doc.font('Helvetica-Oblique').fontSize(16).fillColor(INK).text(`${rx.prescriber.firstName} ${rx.prescriber.lastName}`, sx + 8, y + 20, { width: sw - 16 });
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
      `Signed electronically${rx.prescriber.licenseNumber ? ` · licence ${rx.prescriber.licenseNumber}` : ''} · ${date(rx.issuedAt)}`,
      sx + 8, y + 54, { width: sw - 16 },
    );
  }
  y += sigH + gap + 6;

  // ── For the pharmacy to complete ──────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('PËR BARNATORINË / FOR THE PHARMACY', MARGIN, y, { characterSpacing: 0.8 });
  y += 13;
  const q = (WIDTH - gap * 2) / 3;
  field('Kodi nacional', 'National code', '', MARGIN, y, q, 38);
  field('Çmimi i barit', 'Price', '', MARGIN + q + gap, y, q, 38);
  field('Data e shpërndarjes', 'Date dispensed', '', MARGIN + (q + gap) * 2, y, q, 38);
  y += 38 + gap;
  field('Barnatorja', 'Pharmacy', '', MARGIN, y, WIDTH / 2 - gap / 2, 50);
  field('Nënshkrimi i farmacistit', 'Pharmacist’s signature', '', MARGIN + WIDTH / 2 + gap / 2, y, WIDTH / 2 - gap / 2, 50);
  y += 50 + gap;

  // ── Authentication ────────────────────────────────────────────────────────
  if (rx.contentHash) {
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(MUTED).text('AUTHENTICATION FINGERPRINT (SHA-256) — if any detail above is changed after issue this will no longer match', MARGIN, y, { width: WIDTH, lineBreak: false });
    doc.font('Courier').fontSize(7).fillColor(MUTED).text(rx.contentHash, MARGIN, y + 10, { width: WIDTH, lineBreak: false });
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fy = PAGE.height - 38;
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(`${clinic.name} · prescription ${rx.id}`, MARGIN, fy, { width: WIDTH * 0.8, lineBreak: false });
    doc.text(`${i - range.start + 1} / ${range.count}`, MARGIN, fy, { width: WIDTH, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
