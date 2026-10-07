export type CsvCell = string | number | boolean | null | undefined;
export type CsvColumn<T> = { header: string; value: (row: T) => CsvCell };

// A cell starting with one of these is run as a formula by Excel and Sheets, so text that
// patients or leads typed in (a name, a note) could execute when an admin opens the export.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  // Numbers are ours (a weight of -2.5 is a number, not an injection), only text is guarded.
  let text = typeof value === 'string' && FORMULA_START.test(value) ? `'${value}` : String(value);
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(','));
  return lines.join('\r\n');
}

/** Saves `csv` as a file. The leading byte-order mark makes Excel read accents (ë, ç) correctly. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
