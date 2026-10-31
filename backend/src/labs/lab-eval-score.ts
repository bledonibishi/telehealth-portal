import type { LabReading, ReadResultRow } from './lab-reader.service';
import type { LabCase, ExpectedRow } from './lab-eval-cases';

/**
 * How one reading of a made-up report compares with its answer. Each field is ok, left (nothing read: the doctor types it
 * in, which costs time) or wrong (a confident error, which a busy doctor might save). `blocking` lists the errors that put
 * a wrong number in a patient's record: a wrong value, a result filed under the wrong test, or a row that is not there.
 */
export interface LabScore {
  ok: number;
  left: number;
  wrong: number;
  blocking: string[];
  problems: string[];
}

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const unitOf = (u: string) => plain(u).replace(/\s+/g, '').replace(/[µμ]/g, 'u');
const same = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);

function label(e: ExpectedRow) {
  return e.kind === 'OTHER' ? `${e.name} (other)` : e.kind.toLowerCase();
}

function matches(e: ExpectedRow, r: ReadResultRow) {
  if (r.kind !== e.kind) return false;
  return e.kind !== 'OTHER' || plain(r.analyteName ?? '').includes(plain(e.name ?? ''));
}

export function scoreReading(c: LabCase, reading: LabReading): LabScore {
  const s: LabScore = { ok: 0, left: 0, wrong: 0, blocking: [], problems: [] };
  const wrong = (problem: string, blocking = false) => {
    s.wrong += 1;
    s.problems.push(problem);
    if (blocking) s.blocking.push(problem);
  };
  const left = (problem: string) => {
    s.left += 1;
    s.problems.push(problem);
  };

  if (!reading.readable) {
    left('said the report could not be read');
    return s;
  }

  const unused = [...reading.results];
  for (const e of c.expect.rows) {
    const candidates = unused.filter((r) => matches(e, r));
    const row = candidates.find((r) => same(r.value, e.value)) ?? candidates[0];
    if (!row) {
      // Read, but filed under another test: the number would land on the wrong line of the record.
      const misfiled = unused.find((r) => same(r.value, e.value) && unitOf(r.unit) === unitOf(e.unit));
      if (misfiled) {
        unused.splice(unused.indexOf(misfiled), 1);
        wrong(`${label(e)} ${e.value} was read as ${misfiled.kind === 'OTHER' ? misfiled.analyteName : misfiled.kind}`, true);
      } else left(`${label(e)} was not read`);
      continue;
    }
    unused.splice(unused.indexOf(row), 1);
    if (same(row.value, e.value)) s.ok += 1;
    else wrong(`${label(e)}: read ${row.value}, printed ${e.value}`, true);
    if (unitOf(row.unit) === unitOf(e.unit)) s.ok += 1;
    else wrong(`${label(e)}: unit read as ${row.unit}, printed ${e.unit}`);
    if (same(row.referenceLow, e.low) && same(row.referenceHigh, e.high)) s.ok += 1;
    else wrong(`${label(e)}: range read as ${row.referenceLow ?? '–'}–${row.referenceHigh ?? '–'}, printed ${e.low ?? '–'}–${e.high ?? '–'}`);
    if (e.flagged !== undefined) {
      if (row.flaggedByLab === e.flagged) s.ok += 1;
      else if (row.flaggedByLab === null) left(`${label(e)}: could not tell whether the lab flagged it`);
      else wrong(`${label(e)}: read as ${row.flaggedByLab ? 'flagged' : 'not flagged'} by the lab, it was ${e.flagged ? '' : 'not '}flagged`);
    }
  }
  // Anything left over is not on the report as a readable number: a guess for "<18", or something made up.
  for (const r of unused) wrong(`read a result that is not printed as a number: ${r.kind === 'OTHER' ? r.analyteName : r.kind} ${r.value} ${r.unit}`, true);

  const dates = reading.results.map((r) => r.collectedOn).filter((d): d is string => !!d);
  const date = dates[0] ?? null;
  if (c.expect.collectedOn === null) {
    if (date) wrong(`gave a collection date (${date}) where only a print date is shown`);
    else s.ok += 1;
  } else if (!date) left('did not read the collection date');
  else if (dates.every((d) => d === c.expect.collectedOn)) s.ok += 1;
  else wrong(`collection date read as ${date}, printed ${c.expect.collectedOn}`);

  if (reading.patientName && plain(reading.patientName).replace(/\s+/g, ' ').includes(plain(c.expect.patientName))) s.ok += 1;
  else if (!reading.patientName) left('did not read the patient’s name');
  else wrong(`patient name read as “${reading.patientName}”`);

  return s;
}
