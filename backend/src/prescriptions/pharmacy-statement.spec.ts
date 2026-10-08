import { pharmacyStatementCsv } from './pharmacy-statement';
import { partnerReference as parcelCode } from './partner-payload';

const order = (id: string, day: string, items: Array<[string, string, number, number?]>) => ({
  id, sequence: 1, dispatchedAt: new Date(`${day}T10:00:00Z`), items: items.map(([product, strength, quantity, unitCost]) => ({ product, strength, quantity, unitCost })),
});

describe('pharmacyStatementCsv', () => {
  it('lists each line in date order with the parcel code, and totals what has a cost', () => {
    const csv = pharmacyStatementCsv(
      [order('abcdefgh12345678', '2026-10-05', [['Ozempic', '0.5 mg', 2, 85.5]]), order('zzzzzzzz00000001', '2026-10-02', [['Evorel', '50', 1, 12]])]
    );
    const lines = csv.trim().split('\n');
    expect(lines[1]).toBe(`2026-10-02,${parcelCode('zzzzzzzz00000001')},1,Evorel,50,1,12.00,12.00`);
    expect(lines[2]).toBe(`2026-10-05,TH-12345678,1,Ozempic,0.5 mg,2,85.50,171.00`);
    expect(lines[3]).toBe(',,,,,,Total,183.00');
  });

  it('leaves an unpriced line blank and says so instead of guessing', () => {
    const csv = pharmacyStatementCsv([order('abcdefgh12345678', '2026-10-05', [['Ozempic', '1 mg', 1]])]);
    expect(csv).toContain('Ozempic,1 mg,1,,');
    expect(csv).toContain('1 line(s) have no unit cost');
  });

  it('quotes values that contain commas', () => {
    expect(pharmacyStatementCsv([order('abcdefgh12345678', '2026-10-05', [['Gel, 0.1%', '1 g', 1]])])).toContain('"Gel, 0.1%"');
  });
});
