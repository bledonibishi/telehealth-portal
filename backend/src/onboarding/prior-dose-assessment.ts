/**
 * Decides whether the GLP-1 dose a patient bought is a safe next step from the
 * dose they were on before, using what their prescription proof shows (read
 * by ProofReaderService) and what they told us in the medical questionnaire.
 *
 * Deliberately plain code, not a model: the same inputs always give the same
 * answer, and a clinician can read exactly why. It never approves or changes
 * anything — it explains the risk to the patient and flags it for the
 * prescriber, who makes the decision.
 */

// Clinical thresholds. Confirm with the prescribing lead before go-live and
// change them here only — every rule below reads from this object.
export const PRIOR_DOSE_RULES = {
  // Last injection within this many days: carry on at the same dose, or one
  // step up if they've been on it long enough.
  continueWithinDays: 14,
  // Up to this many days: same dose, but no step up.
  holdWithinDays: 28,
  // Up to this many days: restart one step lower. Beyond it: the starting dose.
  stepDownWithinDays: 56,
  // Weeks on a dose before stepping up (matches the catalog's weeksPerStep).
  minWeeksBeforeStepUp: 4,
  // Proof dated longer ago than this doesn't show current use.
  maxDocumentAgeDays: 90,
};

export type Molecule = 'tirzepatide' | 'semaglutide' | 'liraglutide' | 'other';
export type RiskLevel = 'OK' | 'UNVERIFIED' | 'CAUTION' | 'HIGH';
export type FindingSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
// MATCH_VIA_EVIDENCE: a different name on the proof, linked to the account
// name by a name-change document (marriage certificate, deed poll…).
export type NameMatch = 'MATCH' | 'MATCH_VIA_EVIDENCE' | 'PARTIAL' | 'MISMATCH' | 'NOT_FOUND';
export type LastDoseBucket = 'under_1_week' | '1_2_weeks' | '2_4_weeks' | '4_8_weeks' | 'over_8_weeks';

export interface LadderStrength {
  label: string;
  step: number;
}

/** The GLP-1 the patient bought, and that product's titration ladder. */
export interface RequestedDose {
  productName: string;
  molecule: Molecule;
  label: string;
  step: number;
  ladder: LadderStrength[];
}

/** The patient's own answers from the medical questionnaire. */
export interface ReportedPriorUse {
  medicine: 'mounjaro' | 'wegovy' | 'ozempic' | 'other' | null;
  doseLabel: string | null;
  lastDose: LastDoseBucket | null;
  weeksOnDose: 'under_4_weeks' | '4_plus_weeks' | null;
}

/** What the model read off the uploaded document. Untrusted until checked here. */
export interface DocumentReading {
  readable: boolean;
  isPrescriptionEvidence: boolean;
  patientName: string | null;
  medicineName: string | null;
  molecule: Molecule | 'not_found';
  doseMg: number | null;
  documentDate: string | null; // YYYY-MM-DD
  dateKind: 'dispensed' | 'prescribed' | 'ordered' | 'other' | 'not_found';
  authenticityConcerns: string[];
  notes: string;
}

/** What the model read off a name-change document. */
export interface NameEvidenceReading {
  readable: boolean;
  documentType: string | null;
  names: string[];
}

/**
 * Something about the document the patient can fix by uploading another one.
 * Dose-safety findings are not issues: a better document doesn't change them.
 */
export type DocumentIssueCode =
  | 'UNREADABLE'
  | 'NOT_PRESCRIPTION'
  | 'NAME_MISMATCH'
  | 'NAME_MISSING'
  | 'MEDICINE_MISSING'
  | 'MEDICINE_MISMATCH'
  | 'DOSE_MISSING'
  | 'DOSE_MISMATCH'
  | 'DOSE_NEWER_PROOF'
  | 'DATE_MISSING'
  | 'DATE_OLD'
  | 'DATE_FUTURE';

export interface DocumentIssue {
  code: DocumentIssueCode;
  patientHint: string;
}

/**
 * The patient's answer when the document's dose differs from the one they gave
 * in the questionnaire: the document is right, they've stepped up since it, or
 * they don't know.
 */
export type DoseClarification = 'DOCUMENT_CORRECT' | 'STEPPED_UP_SINCE' | 'STEPPED_DOWN_SINCE' | 'NOT_SURE';

/**
 * One line of the patient-facing checklist. PASS: matches. FAIL: they should
 * do something (the hint says what). REVIEW: doesn't match, but nothing for
 * the patient to do — the clinician will confirm.
 */
export interface DocumentCheck {
  key: 'NAME' | 'MEDICINE' | 'DOSE' | 'DATE';
  status: 'PASS' | 'FAIL' | 'REVIEW';
  value: string | null;
  hint: string | null;
}

export interface Finding {
  severity: FindingSeverity;
  message: string;
}

export interface Assessment {
  riskLevel: RiskLevel;
  nameMatch: NameMatch | null;
  // Titration step on the requested product that the document proves. Null
  // unless the document is readable, in the patient's name and the same medicine.
  verifiedStep: number | null;
  // Highest step it would be safe to prescribe next, if it could be worked out.
  safeMaxStep: number | null;
  safeMaxDoseLabel: string | null;
  requestedDoseLabel: string | null;
  suggestedDoseLabel: string | null;
  findings: Finding[];
  documentIssues: DocumentIssue[];
  // Empty when the document couldn't be read at all.
  checks: DocumentCheck[];
  // The patient's own questionnaire answers, for the clinician to compare with the document.
  reportedMedicineLabel: string | null;
  reportedDoseLabel: string | null;
  reportedLastDoseLabel: string | null;
  reportedWeeksOnDoseLabel: string | null;
  patientMessage: string;
}

export interface AssessmentInput {
  patient: { firstName: string; lastName: string };
  requested: RequestedDose | null;
  reported: ReportedPriorUse | null;
  document: DocumentReading | null;
  nameEvidence?: NameEvidenceReading | null;
  doseClarification?: DoseClarification | null;
  today: Date;
}

const RISK_ORDER: RiskLevel[] = ['OK', 'UNVERIFIED', 'CAUTION', 'HIGH'];
const worst = (a: RiskLevel, b: RiskLevel): RiskLevel => (RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b);

// Upper end of each answer, so the rules always assume the longer gap.
const GAP_DAYS: Record<LastDoseBucket, number> = {
  under_1_week: 7,
  '1_2_weeks': 14,
  '2_4_weeks': 28,
  '4_8_weeks': 56,
  over_8_weeks: Infinity,
};

export const MEDICINE_LABEL: Record<NonNullable<ReportedPriorUse['medicine']>, string> = {
  mounjaro: 'Mounjaro',
  wegovy: 'Wegovy',
  ozempic: 'Ozempic',
  other: 'your previous medicine',
};

// As worded in the questionnaire (questionnaires/definitions.ts).
const LAST_DOSE_LABEL: Record<LastDoseBucket, string> = {
  under_1_week: 'In the last week',
  '1_2_weeks': '1 to 2 weeks ago',
  '2_4_weeks': '2 to 4 weeks ago',
  '4_8_weeks': '4 to 8 weeks ago',
  over_8_weeks: 'More than 8 weeks ago',
};
const WEEKS_ON_DOSE_LABEL = { under_4_weeks: 'Less than 4 weeks', '4_plus_weeks': '4 weeks or more' } as const;

const MEDICINE_MOLECULE: Record<NonNullable<ReportedPriorUse['medicine']>, Molecule> = {
  mounjaro: 'tirzepatide',
  wegovy: 'semaglutide',
  ozempic: 'semaglutide',
  other: 'other',
};

export const mgOf = (label: string): number | null => {
  const n = parseFloat(label);
  return Number.isFinite(n) ? n : null;
};

const formatMg = (mg: number) => `${mg} mg`;

const DATE_KIND_LABEL: Record<DocumentReading['dateKind'], string | undefined> = {
  dispensed: 'Dispensed',
  prescribed: 'Prescribed',
  ordered: 'Ordered',
  other: undefined,
  not_found: undefined,
};

function words(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** Whether the name on the document is the patient's. Initials ("J. Smith") count as partial. */
export function matchName(onDocument: string | null, patient: { firstName: string; lastName: string }): NameMatch {
  if (!onDocument?.trim()) return 'NOT_FOUND';
  const doc = words(onDocument);
  const first = words(patient.firstName);
  const last = words(patient.lastName);
  const lastOk = last.length > 0 && last.every((w) => doc.includes(w));
  const firstOk = first.length > 0 && first.every((w) => doc.includes(w));
  const firstInitial = first.length > 0 && doc.some((w) => w.length === 1 && w === first[0][0]);
  if (lastOk && firstOk) return 'MATCH';
  if (lastOk || (firstOk && last.length === 0) || (firstInitial && lastOk)) return 'PARTIAL';
  return 'MISMATCH';
}

const significant = (name: string) => words(name).filter((w) => w.length > 1);

/** The same person's name, allowing for extra middle names on either side. */
function sameName(a: string, b: string): boolean {
  const [short, long] = [significant(a), significant(b)].sort((x, y) => x.length - y.length);
  return short.length >= 2 && short.every((w) => long.includes(w));
}

/** The name-change document shows both the name on the proof and the account name. */
export function evidenceLinksNames(evidence: NameEvidenceReading, onDocument: string, patient: { firstName: string; lastName: string }): boolean {
  if (!evidence.readable) return false;
  return evidence.names.some((n) => sameName(n, onDocument)) && evidence.names.some((n) => matchName(n, patient) === 'MATCH');
}

/** The step on `ladder` for a dose: an exact match, else the highest strength below it. */
export function stepForDose(ladder: LadderStrength[], doseMg: number): number | null {
  const steps = ladder
    .map((s) => ({ step: s.step, mg: mgOf(s.label) }))
    .filter((s): s is { step: number; mg: number } => s.mg !== null)
    .sort((a, b) => a.mg - b.mg);
  const exact = steps.find((s) => s.mg === doseMg);
  if (exact) return exact.step;
  const below = steps.filter((s) => s.mg < doseMg);
  return below.length ? below[below.length - 1].step : null;
}

const labelForStep = (ladder: LadderStrength[], step: number) => ladder.find((s) => s.step === step)?.label ?? null;

export function assessPriorDose(input: AssessmentInput): Assessment {
  const { requested, reported, document, today } = input;
  const findings: Finding[] = [];
  const patientLines: string[] = [];
  let risk: RiskLevel = 'OK';
  const flag = (severity: FindingSeverity, level: RiskLevel, message: string) => {
    findings.push({ severity, message });
    risk = worst(risk, level);
  };

  const reportedMolecule = reported?.medicine ? MEDICINE_MOLECULE[reported.medicine] : null;
  const reportedMg = reported?.doseLabel ? mgOf(reported.doseLabel) : null;

  // ── The document: whose it is, what it shows, and when ────────────────────
  const documentIssues: DocumentIssue[] = [];
  const issue = (code: DocumentIssueCode, patientHint: string) => {
    documentIssues.push({ code, patientHint });
    return patientHint;
  };
  const checks: DocumentCheck[] = [];
  const check = (key: DocumentCheck['key'], status: DocumentCheck['status'], value: string | null, hint: string | null = null) =>
    checks.push({ key, status, value, hint });
  let nameMatch: NameMatch | null = null;
  let documentTrusted = false;
  if (!document) {
    flag('WARNING', 'UNVERIFIED', 'Document was not checked automatically — review it manually');
  } else if (!document.readable) {
    flag('WARNING', 'UNVERIFIED', 'Document could not be read automatically (blurry, cropped or not a document)');
    issue('UNREADABLE', 'We couldn’t read it. Try a clearer photo of the whole label or page.');
  } else {
    documentTrusted = true;
    if (!document.isPrescriptionEvidence) {
      documentTrusted = false;
      flag('WARNING', 'CAUTION', 'Document does not look like a prescription, pharmacy label, pharmacy record or order confirmation');
      issue('NOT_PRESCRIPTION', 'This isn’t a prescription, pharmacy label, pharmacy record or order confirmation.');
    }

    nameMatch = matchName(document.patientName, input.patient);
    const patientName = `${input.patient.firstName} ${input.patient.lastName}`;
    if (nameMatch === 'MISMATCH' && input.nameEvidence && evidenceLinksNames(input.nameEvidence, document.patientName!, input.patient)) {
      nameMatch = 'MATCH_VIA_EVIDENCE';
      check('NAME', 'PASS', document.patientName);
      findings.push({
        severity: 'INFO',
        message: `Name on document (“${document.patientName}”) linked to the patient by a ${input.nameEvidence.documentType ?? 'name-change document'} — check it`,
      });
    } else if (nameMatch === 'MISMATCH') {
      documentTrusted = false;
      flag('CRITICAL', 'HIGH', `Name on document (“${document.patientName}”) does not match the patient (“${patientName}”)`);
      if (input.nameEvidence) {
        flag('WARNING', 'HIGH', `Name-change document provided, but it does not show both “${document.patientName}” and “${patientName}”`);
        check('NAME', 'FAIL', document.patientName, issue('NAME_MISMATCH', `Expected: ${patientName}`));
      } else {
        check('NAME', 'FAIL', document.patientName, issue('NAME_MISMATCH', `Expected: ${patientName}`));
      }
    } else if (nameMatch === 'PARTIAL') {
      flag('WARNING', 'CAUTION', `Name on document (“${document.patientName}”) only partly matches the patient (“${patientName}”)`);
      check('NAME', 'PASS', document.patientName);
    } else if (nameMatch === 'NOT_FOUND') {
      flag('WARNING', 'CAUTION', 'No patient name visible on the document');
      check('NAME', 'FAIL', null, issue('NAME_MISSING', 'Not visible on the document'));
    } else {
      check('NAME', 'PASS', document.patientName);
    }

    const medicineShown = document.medicineName ?? (document.molecule !== 'not_found' ? document.molecule : null);
    if (document.molecule === 'not_found') {
      flag('WARNING', 'CAUTION', 'No medicine name visible on the document');
      check('MEDICINE', 'FAIL', null, issue('MEDICINE_MISSING', 'Not visible on the document'));
    } else if (reportedMolecule && document.molecule !== reportedMolecule) {
      const said = MEDICINE_LABEL[reported!.medicine!];
      flag('WARNING', 'CAUTION', `Document shows ${medicineShown}, but the patient said ${said}`);
      check('MEDICINE', 'FAIL', medicineShown, issue('MEDICINE_MISMATCH', `Expected: ${said}`));
    } else {
      check('MEDICINE', 'PASS', medicineShown);
    }

    if (document.doseMg === null) {
      flag('WARNING', 'CAUTION', 'No dose visible on the document');
      check('DOSE', 'FAIL', null, issue('DOSE_MISSING', 'Not visible on the document'));
    } else if (reportedMolecule && document.molecule !== 'not_found' && document.molecule !== reportedMolecule) {
      // Doses of different medicines aren't comparable (1.5 mg semaglutide vs 2.5 mg tirzepatide);
      // the medicine line already asks about the mismatch.
      // Nothing to say: the medicine line already shows the mismatch.
      check('DOSE', 'REVIEW', formatMg(document.doseMg), null);
    } else if (reportedMg !== null && document.doseMg !== reportedMg) {
      // Unless the patient confirms the document, the dose rules go by the lower
      // of the two doses (see below); this decides what they're asked and what
      // the clinician is told.
      const onDoc = formatMg(document.doseMg);
      const said = formatMg(reportedMg);
      if (input.doseClarification === 'DOCUMENT_CORRECT') {
        findings.push({ severity: 'INFO', message: `Patient confirmed the document’s dose (${onDoc}); the questionnaire said ${said}` });
        check('DOSE', 'PASS', onDoc);
      } else if (input.doseClarification === 'STEPPED_UP_SINCE') {
        flag('WARNING', 'CAUTION', `Patient says they moved up to ${said} after this document (${onDoc}) — unverified; dose rules use ${onDoc}`);
        check('DOSE', 'FAIL', onDoc, issue('DOSE_NEWER_PROOF', `Expected: ${said} — upload a newer document if you have one`));
      } else if (input.doseClarification === 'STEPPED_DOWN_SINCE') {
        // Going down needs no more proof: the lower dose is the safer one to go by.
        flag('WARNING', 'CAUTION', `Patient says their dose went down to ${said} after this document (${onDoc}) — dose rules use ${said}; ask why (e.g. side effects)`);
        check('DOSE', 'REVIEW', onDoc, `You’re now on ${said} — your clinician will go by that`);
      } else if (input.doseClarification === 'NOT_SURE') {
        flag('WARNING', 'CAUTION', `Document shows ${onDoc}, the patient said ${said} and isn’t sure which is right — dose rules use the lower; confirm with them`);
        check('DOSE', 'REVIEW', onDoc, 'Your clinician will confirm it');
      } else {
        flag('WARNING', 'CAUTION', `Document shows ${onDoc}, but the patient said ${said}`);
        check('DOSE', 'FAIL', onDoc, issue('DOSE_MISMATCH', `Expected: ${said}`));
      }
    } else {
      check('DOSE', 'PASS', formatMg(document.doseMg));
    }

    const date = document.documentDate ? new Date(`${document.documentDate}T00:00:00Z`) : null;
    const dateShown = document.documentDate ? `${DATE_KIND_LABEL[document.dateKind] ?? 'Dated'} ${document.documentDate}` : null;
    if (!date || Number.isNaN(date.getTime())) {
      flag('WARNING', 'CAUTION', 'No date visible on the document — cannot tell how recent it is');
      check('DATE', 'FAIL', null, issue('DATE_MISSING', 'Not visible on the document'));
    } else {
      const ageDays = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
      if (ageDays < -1) {
        flag('CRITICAL', 'HIGH', `Document is dated in the future (${document.documentDate})`);
        check('DATE', 'FAIL', dateShown, issue('DATE_FUTURE', 'Couldn’t read the date clearly'));
      } else if (ageDays > PRIOR_DOSE_RULES.maxDocumentAgeDays) {
        flag('WARNING', 'CAUTION', `Document is ${ageDays} days old (${document.dateKind} ${document.documentDate}) — does not show current use`);
        check('DATE', 'FAIL', dateShown, issue('DATE_OLD', 'Must be from the last 3 months'));
      } else {
        findings.push({ severity: 'INFO', message: `Document ${document.dateKind} ${document.documentDate} (${ageDays} days ago)` });
        check('DATE', 'PASS', dateShown);
      }
    }

    // Shown to the clinician only: asking the patient about suspected editing
    // is the clinician's call, not an automatic message's.
    for (const concern of document.authenticityConcerns) flag('WARNING', 'CAUTION', `Possible authenticity issue: ${concern}`);
  }

  // ── The dose: is the requested one a safe next step? ──────────────────────
  // The document's dose is the evidence; without it, the patient's answer is used
  // but the result can't be better than UNVERIFIED. When the two disagree, the
  // lower one is used — unless the patient confirmed the document is right.
  const docMolecule = documentTrusted && document!.molecule !== 'not_found' ? document!.molecule : null;
  const docMg = documentTrusted ? document!.doseMg : null;
  const priorMolecule = docMolecule ?? reportedMolecule;
  const disagree = docMg !== null && reportedMg !== null && docMg !== reportedMg && (!reportedMolecule || docMolecule === reportedMolecule);
  const priorMg = disagree && input.doseClarification !== 'DOCUMENT_CORRECT' ? Math.min(docMg!, reportedMg!) : docMg ?? reportedMg;
  const priorFromDocument = docMg !== null && priorMg === docMg;
  const priorDescription = priorMg !== null ? `${document?.medicineName && priorFromDocument ? document.medicineName : reported?.medicine ? MEDICINE_LABEL[reported.medicine] : 'your medicine'} ${formatMg(priorMg)}` : null;

  let verifiedStep: number | null = null;
  let safeMaxStep: number | null = null;
  let suggestedDoseLabel: string | null = null;

  if (!requested) {
    flag('WARNING', 'UNVERIFIED', 'Could not tell which dose the patient ordered — compare the proof against the order manually');
  } else if (!priorMolecule || priorMg === null) {
    flag('WARNING', 'UNVERIFIED', 'Previous medicine or dose unknown — cannot check the dose step');
  } else if (priorMolecule !== requested.molecule) {
    flag('WARNING', 'CAUTION', `Switching from ${priorMolecule} (${formatMg(priorMg)}) to ${requested.molecule} (${requested.label}) — choose an equivalent starting dose`);
    patientLines.push(`You’re switching from ${priorMolecule} to ${requested.productName}. Your clinician will choose the right starting dose for the switch, which may be lower than the one you picked.`);
  } else {
    const priorStep = stepForDose(requested.ladder, priorMg);
    if (priorStep === null) {
      flag('WARNING', 'CAUTION', `Previous dose ${formatMg(priorMg)} is below the lowest ${requested.productName} strength`);
    } else {
      if (priorFromDocument && documentTrusted && docMolecule === requested.molecule) verifiedStep = priorStep;

      const gap = reported?.lastDose ? GAP_DAYS[reported.lastDose] : null;
      const longEnough = reported?.weeksOnDose === '4_plus_weeks';
      let base = priorStep;
      let canStepUp = false;
      let gapReason: string | null = null;
      if (gap === null) {
        flag('WARNING', 'CAUTION', 'Time since last injection unknown — no step up assumed');
      } else if (gap <= PRIOR_DOSE_RULES.continueWithinDays) {
        canStepUp = longEnough;
      } else if (gap <= PRIOR_DOSE_RULES.holdWithinDays) {
        gapReason = 'it’s been 2 to 4 weeks since your last injection, so it’s safest to stay on the same dose for now';
      } else if (gap <= PRIOR_DOSE_RULES.stepDownWithinDays) {
        base = Math.max(1, priorStep - 1);
        gapReason = 'it’s been 4 to 8 weeks since your last injection, so you’ll need to restart a step lower while your body readjusts';
      } else {
        base = 1;
        gapReason = 'it’s been more than 8 weeks since your last injection, so you’ll need to restart on the starting dose';
      }
      const top = Math.max(...requested.ladder.map((s) => s.step));
      safeMaxStep = Math.min(top, base + (canStepUp ? 1 : 0));
      suggestedDoseLabel = labelForStep(requested.ladder, Math.min(requested.step, safeMaxStep));

      const jump = requested.step - safeMaxStep;
      const priorLabel = labelForStep(requested.ladder, priorStep) ?? formatMg(priorMg);
      if (jump <= 0) {
        findings.push({ severity: 'INFO', message: `Requested ${requested.label} is within the safe range from ${priorLabel} (max ${labelForStep(requested.ladder, safeMaxStep)})` });
        if (!priorFromDocument) risk = worst(risk, 'UNVERIFIED');
      } else {
        const level: RiskLevel = jump >= 2 ? 'HIGH' : 'CAUTION';
        flag(
          jump >= 2 ? 'CRITICAL' : 'WARNING',
          level,
          `Requested ${requested.label} is ${jump} step(s) above the safe maximum ${suggestedDoseLabel} (previous ${priorLabel}${priorFromDocument ? ', from document' : ', self-reported'}${gap !== null ? `, last injection up to ${Number.isFinite(gap) ? `${gap} days` : 'over 8 weeks'} ago` : ''}${!longEnough ? ', under 4 weeks on that dose' : ''})`,
        );
        const why = gapReason
          ?? (requested.step > priorStep + 1
            ? `going from ${priorLabel} to ${requested.label} skips ${requested.step - priorStep - 1 > 1 ? 'several steps' : 'a step'}, which raises the risk of strong side effects such as sickness, vomiting and dehydration`
            : `you’ve been on ${priorLabel} for less than 4 weeks, and doses should only go up after at least 4 weeks on the current one`);
        patientLines.unshift(
          `${priorFromDocument ? 'Your document shows' : 'You told us you were on'} ${priorDescription}. You chose ${requested.label}, but ${why}. For your safety, your clinician will most likely start you on ${suggestedDoseLabel} instead.`,
        );
      }
    }
  }

  // With only document issues, the issues' own hints are the whole message.
  if (patientLines.length === 0 && !documentIssues.length) {
    patientLines.push(
      risk === 'OK' && priorDescription
        ? `Thanks — your document shows ${priorDescription}, which fits the dose you’ve chosen. A clinician will confirm it.`
        : 'Thanks — a clinician will check your document.',
    );
  } else if (patientLines.length) {
    patientLines.push('You don’t need to do anything else now — a clinician confirms your dose before anything is sent, and will contact you if it changes.');
  }

  return {
    riskLevel: risk,
    nameMatch,
    verifiedStep,
    safeMaxStep,
    safeMaxDoseLabel: safeMaxStep !== null && requested ? labelForStep(requested.ladder, safeMaxStep) : null,
    requestedDoseLabel: requested?.label ?? null,
    suggestedDoseLabel,
    findings,
    documentIssues,
    checks,
    reportedMedicineLabel: reported?.medicine ? (reported.medicine === 'other' ? 'Other' : MEDICINE_LABEL[reported.medicine]) : null,
    reportedDoseLabel: reported?.doseLabel ?? null,
    reportedLastDoseLabel: reported?.lastDose ? LAST_DOSE_LABEL[reported.lastDose] : null,
    reportedWeeksOnDoseLabel: reported?.weeksOnDose ? WEEKS_ON_DOSE_LABEL[reported.weeksOnDose] : null,
    patientMessage: patientLines.join(' '),
  };
}
