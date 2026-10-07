import PDFDocument from 'pdfkit';

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const WIDTH = PAGE.width - MARGIN * 2;
const BOTTOM = PAGE.height - 56; // leave room for the footer

const COLOR = {
  ink: '#111827',
  muted: '#6b7280',
  faint: '#9ca3af',
  line: '#e5e7eb',
  accent: '#1e4fd8',
  panel: '#f8fafc',
  danger: '#b91c1c',
  dangerBg: '#fef2f2',
  cold: '#075985',
  coldBg: '#e0f2fe',
};

const FORM_LABEL: Record<string, string> = {
  INJECTION_PEN: 'Injection pen',
  INJECTION_VIAL: 'Injection (vial)',
  GEL: 'Gel',
  PATCH: 'Transdermal patch',
  TABLET: 'Tablet',
  CAPSULE: 'Capsule',
  SPRAY: 'Spray',
  PELLET: 'Pellet',
};

/** What the document needs from a prescription, so it can be drawn from a real record or a test one. */
export interface PrescriptionPdfInput {
  id: string;
  issuedAt: Date;
  validUntil: Date | null;
  refillsAllowed: number;
  status: string;
  cancelReason?: string | null;
  contentHash: string | null;
  tampered: boolean;
  medication: string;
  dosage: string;
  instructions: string;
  patient: { firstName: string; lastName: string; dateOfBirth: Date; addressLine1?: string | null; addressLine2?: string | null; city?: string | null; postcode?: string | null; country?: string | null };
  prescriber: { firstName: string; lastName: string; licenseNumber?: string | null; licensingBody?: string | null } | null;
  items: Array<{
    quantity: number;
    directions: string;
    strength: { label: string; packDescription?: string | null };
    product: { name: string; brandName: string | null; form: string; requiresColdChain: boolean };
  }>;
}

const date = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Draws one prescription as a one-page (or longer, when it has many medicines) A4 document. */
export function renderPrescriptionPdf(rx: PrescriptionPdfInput, clinic: { name: string; address?: string }): Promise<Buffer> {
  // A small bottom margin: the footer sits below BOTTOM, and text written past the margin would start a new page.
  const doc = new PDFDocument({ size: 'A4', margins: { top: MARGIN, bottom: 24, left: MARGIN, right: MARGIN }, bufferPages: true, info: { Title: `Prescription ${rx.id}`, Author: clinic.name } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const h = (text: string, font: string, size: number, width = WIDTH) => doc.font(font).fontSize(size).heightOfString(text, { width });
  const ensure = (height: number) => {
    if (doc.y + height > BOTTOM) doc.addPage();
  };
  /** A small label above a value, drawn at a fixed spot; returns the height used. */
  const labelled = (label: string, value: string, x: number, y: number, width: number, opts: { mono?: boolean; size?: number } = {}) => {
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLOR.faint).text(label.toUpperCase(), x, y, { width, characterSpacing: 0.6 });
    doc.font(opts.mono ? 'Courier' : 'Helvetica').fontSize(opts.size ?? 10.5).fillColor(COLOR.ink).text(value, x, y + 11, { width });
  };
  const sectionTitle = (title: string) => {
    ensure(40);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.accent).text(title.toUpperCase(), MARGIN, doc.y, { characterSpacing: 1 });
    const y = doc.y + 3;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + WIDTH, y).lineWidth(0.75).strokeColor(COLOR.line).stroke();
    doc.y = y + 9;
  };

  // ── Header ────────────────────────────────────────────────────────────────
  doc.rect(0, 0, PAGE.width, 7).fill(COLOR.accent);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR.ink).text(clinic.name, MARGIN, 30, { width: WIDTH * 0.6 });
  if (clinic.address) doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted).text(clinic.address, MARGIN, doc.y + 1, { width: WIDTH * 0.6 });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLOR.accent).text('PRESCRIPTION', MARGIN, 30, { width: WIDTH, align: 'right', characterSpacing: 1 });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.muted).text('Electronic prescription · prescription-only medicine', MARGIN, 54, { width: WIDTH, align: 'right' });
  doc.y = Math.max(doc.y, 66) + 12;

  // ── A stop sign for anything that must not be dispensed ───────────────────
  if (rx.status !== 'ACTIVE' || rx.tampered) {
    const text = rx.tampered ? 'CONTENT CHANGED SINCE ISSUE — DO NOT DISPENSE' : `${rx.status} — DO NOT DISPENSE${rx.cancelReason ? ` (${rx.cancelReason})` : ''}`;
    const y = doc.y;
    doc.roundedRect(MARGIN, y, WIDTH, 30, 4).fillAndStroke(COLOR.dangerBg, COLOR.danger);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.danger).text(text, MARGIN, y + 10, { width: WIDTH, align: 'center' });
    doc.y = y + 42;
  }

  // ── Summary strip ─────────────────────────────────────────────────────────
  {
    const y = doc.y;
    const cols = [
      { label: 'Prescription ID', value: rx.id, w: 195, mono: true, size: 8.5 },
      { label: 'Issued', value: date(rx.issuedAt), w: 100 },
      { label: 'Valid until', value: rx.validUntil ? date(rx.validUntil) : '—', w: 100 },
      { label: 'Repeats', value: String(rx.refillsAllowed), w: WIDTH - 395 - 32 },
    ];
    doc.roundedRect(MARGIN, y, WIDTH, 44, 6).fillAndStroke(COLOR.panel, COLOR.line);
    let x = MARGIN + 16;
    for (const c of cols) {
      labelled(c.label, c.value, x, y + 9, c.w, { mono: c.mono, size: c.size });
      x += c.w;
    }
    doc.y = y + 44 + 18;
  }

  // ── Patient and prescriber, side by side ──────────────────────────────────
  {
    const y = doc.y;
    const colW = (WIDTH - 28) / 2;
    const address = [rx.patient.addressLine1, rx.patient.addressLine2, [rx.patient.postcode, rx.patient.city].filter(Boolean).join(' '), rx.patient.country].filter(Boolean);
    const sub = (x: number, title: string, name: string, lines: string[]) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.accent).text(title.toUpperCase(), x, y, { width: colW, characterSpacing: 1 });
      doc.moveTo(x, y + 12).lineTo(x + colW, y + 12).lineWidth(0.75).strokeColor(COLOR.line).stroke();
      doc.font('Helvetica-Bold').fontSize(12.5).fillColor(COLOR.ink).text(name, x, y + 20, { width: colW });
      let cy = doc.y + 3;
      for (const line of lines) {
        doc.font('Helvetica').fontSize(10).fillColor(COLOR.muted).text(line, x, cy, { width: colW });
        cy = doc.y + 1.5;
      }
      return cy;
    };
    const left = sub(MARGIN, 'Patient', `${rx.patient.firstName} ${rx.patient.lastName}`, [`Date of birth: ${date(rx.patient.dateOfBirth)}`, ...address]);
    const right = sub(
      MARGIN + colW + 28,
      'Prescriber',
      rx.prescriber ? `Dr ${rx.prescriber.firstName} ${rx.prescriber.lastName}` : '—',
      rx.prescriber
        ? [
            `Licence: ${rx.prescriber.licenseNumber ?? '—'}`,
            ...(rx.prescriber.licensingBody ? [rx.prescriber.licensingBody] : []),
            clinic.name,
            ...(clinic.address ? [clinic.address] : []),
          ]
        : [],
    );
    doc.y = Math.max(left, right) + 16;
  }

  // ── Medicines ─────────────────────────────────────────────────────────────
  sectionTitle('Medicines');
  const directions = new Set<string>();
  const cards =
    rx.items.length > 0
      ? rx.items.map((item) => {
          directions.add(item.directions.trim());
          return {
            title: item.product.brandName ?? item.product.name,
            subtitle: item.product.brandName ? item.product.name : '',
            facts: [
              ['Strength', item.strength.label],
              ['Form', FORM_LABEL[item.product.form] ?? item.product.form],
              ['Pack', item.strength.packDescription ?? '—'],
              ['Quantity', `${item.quantity} pack${item.quantity === 1 ? '' : 's'}`],
            ] as Array<[string, string]>,
            directions: item.directions,
            cold: item.product.requiresColdChain,
          };
        })
      : // Issued before structured prescribing: only the free-text summary exists.
        [{ title: rx.medication, subtitle: '', facts: [['Dosage', rx.dosage]] as Array<[string, string]>, directions: '', cold: false }];

  cards.forEach((card, i) => {
    const inner = WIDTH - 28;
    const factW = inner / card.facts.length;
    const dirH = card.directions ? 18 + h(card.directions, 'Helvetica', 10.5, inner - 20) + 14 : 0;
    const total = 16 + 20 + (card.subtitle ? 14 : 0) + 8 + 34 + (dirH ? 10 + dirH : 0) + (card.cold ? 10 + 26 : 0) + 14;
    ensure(total);
    const top = doc.y;

    doc.roundedRect(MARGIN, top, WIDTH, total, 6).lineWidth(0.75).strokeColor(COLOR.line).stroke();
    doc.circle(MARGIN + 22, top + 25, 10).fill(COLOR.accent);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#fff').text(String(i + 1), MARGIN + 12, top + 20.5, { width: 20, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(14).fillColor(COLOR.ink).text(card.title, MARGIN + 42, top + 14, { width: inner - 30 });
    let y = top + 16 + 18;
    if (card.subtitle) {
      doc.font('Helvetica').fontSize(10).fillColor(COLOR.muted).text(card.subtitle, MARGIN + 42, y - 2, { width: inner - 30 });
      y += 14;
    }
    y += 10;
    card.facts.forEach(([label, value], k) => labelled(label, value, MARGIN + 14 + k * factW, y, factW - 8));
    y += 34;

    if (card.directions) {
      const boxH = dirH;
      doc.roundedRect(MARGIN + 14, y + 4, inner, boxH, 4).fill(COLOR.panel);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLOR.faint).text('DIRECTIONS (TO BE PRINTED ON THE LABEL)', MARGIN + 24, y + 12, { characterSpacing: 0.6 });
      doc.font('Helvetica').fontSize(10.5).fillColor(COLOR.ink).text(card.directions, MARGIN + 24, y + 24, { width: inner - 20 });
      y += 4 + boxH;
    }
    if (card.cold) {
      doc.roundedRect(MARGIN + 14, y + 10, inner, 26, 4).fill(COLOR.coldBg);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR.cold).text('Cold chain: store refrigerated (2–8 °C) and send for same-day or next-day delivery.', MARGIN + 24, y + 19, { width: inner - 20 });
    }
    doc.y = top + total + 10;
  });

  // Anything the prescriber wrote beyond the directions already shown above.
  const extra = rx.instructions
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !directions.has(l));
  if (extra.length > 0 && rx.items.length > 0) {
    sectionTitle('Additional instructions');
    doc.font('Helvetica').fontSize(10.5).fillColor(COLOR.ink).text(extra.join('\n'), MARGIN, doc.y, { width: WIDTH });
    doc.moveDown(0.8);
  }

  // ── Signature and authentication ──────────────────────────────────────────
  {
    ensure(96);
    // Room above the line for the signature itself, which is drawn over it.
    const y = doc.y + 38;
    const half = (WIDTH - 24) / 2;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + half, y).lineWidth(0.75).strokeColor(COLOR.faint).stroke();
    doc.font('Helvetica-Oblique').fontSize(15).fillColor(COLOR.ink).text(rx.prescriber ? `${rx.prescriber.firstName} ${rx.prescriber.lastName}` : '—', MARGIN, y - 24, { width: half });
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.muted).text(
      `Signed electronically${rx.prescriber?.licenseNumber ? ` · licence ${rx.prescriber.licenseNumber}` : ''}\nIssued ${date(rx.issuedAt)}`,
      MARGIN, y + 5, { width: half },
    );
    if (rx.contentHash) {
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLOR.faint).text('AUTHENTICATION FINGERPRINT (SHA-256)', MARGIN + half + 24, y - 12, { width: half, characterSpacing: 0.6 });
      doc.font('Courier').fontSize(7.5).fillColor(COLOR.muted).text(rx.contentHash, MARGIN + half + 24, y, { width: half });
      doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.faint).text('If any detail above has been changed since issue, this will no longer match.', MARGIN + half + 24, doc.y + 2, { width: half });
    }
    doc.y = y + 58;
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = PAGE.height - 42;
    doc.moveTo(MARGIN, y - 6).lineTo(MARGIN + WIDTH, y - 6).lineWidth(0.5).strokeColor(COLOR.line).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.faint).text('Issued electronically following a remote clinical consultation.', MARGIN, y, { width: WIDTH * 0.7, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN, y, { width: WIDTH, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
