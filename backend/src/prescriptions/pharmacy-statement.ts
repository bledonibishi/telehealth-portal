import { partnerReference as parcelCode } from './partner-payload';

export type StatementOrder = {
  id: string;
  sequence: number;
  dispatchedAt: Date;
  items: Array<{ product: string; strength: string; quantity: number; unitCost?: number | null }>;
};


const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * A month of what the pharmacy handed over, as CSV, so what we owe it can be checked against its own invoice. Costs are
 * optional: each line carries what one unit costs us (set on the dose in the catalog). Without one the amount is left
 * blank rather than guessed.
 */
export function pharmacyStatementCsv(orders: StatementOrder[]): string {
  const rows = [['Handed over', 'Parcel code', 'Supply', 'Medicine', 'Strength', 'Quantity', 'Unit cost', 'Amount']];
  let total = 0;
  let unpriced = 0;
  for (const o of [...orders].sort((a, b) => a.dispatchedAt.getTime() - b.dispatchedAt.getTime())) {
    for (const i of o.items) {
      const unit = i.unitCost ?? undefined;
      if (unit === undefined) unpriced += 1;
      else total += unit * i.quantity;
      rows.push([
        o.dispatchedAt.toISOString().slice(0, 10), parcelCode(o.id), String(o.sequence), i.product, i.strength, String(i.quantity),
        unit === undefined ? '' : unit.toFixed(2), unit === undefined ? '' : (unit * i.quantity).toFixed(2),
      ]);
    }
  }
  rows.push(['', '', '', '', '', '', 'Total', total.toFixed(2)]);
  if (unpriced > 0) rows.push([`${unpriced} line(s) have no unit cost set (set it on the dose), so they are not in the total`]);
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}
