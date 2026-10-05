import { kg } from '@/lib/weight';
import { Card, CardHeader } from '@/components/portal/Card';
import { Icon } from '@/components/portal/Icon';

type Milestone = { key: string; label: string; reached: boolean; hint?: string };

/** The steps on the way to the goal: every 5 kg, the quarter marks, and the goal itself. Pure, so it can be reasoned about. */
export function milestonesOf(startKg: number, currentKg: number, targetKg: number): Milestone[] {
  const toLose = startKg - targetKg;
  if (!(toLose > 0)) return [];
  const lost = Math.max(startKg - currentKg, 0);
  const out: Milestone[] = [];
  for (let n = 5; n < toLose; n += 5) out.push({ key: `kg${n}`, label: `${n} kg lost`, reached: lost >= n });
  for (const pct of [25, 50, 75]) {
    const at = (toLose * pct) / 100;
    out.push({ key: `pct${pct}`, label: `${pct}% of the way`, reached: lost >= at, hint: kg(startKg - at) });
  }
  out.push({ key: 'goal', label: `Goal: ${kg(targetKg)}`, reached: lost >= toLose });
  // In the order they are reached, so the row reads left to right as the journey.
  const need = (m: Milestone) => (m.key === 'goal' ? toLose : m.key.startsWith('kg') ? Number(m.key.slice(2)) : (toLose * Number(m.key.slice(3))) / 100);
  return out.sort((a, b) => need(a) - need(b));
}

/** Milestones as a quiet row of markers: reached ones filled, the next one named. No points, no badges to collect. */
export function Milestones({ journey }: { journey: any }) {
  if (journey.startingWeightKg == null || journey.currentWeightKg == null || journey.targetWeightKg == null) return null;
  const list = milestonesOf(journey.startingWeightKg, journey.currentWeightKg, journey.targetWeightKg);
  if (!list.length) return null;
  const next = list.find((m) => !m.reached);
  const reached = list.filter((m) => m.reached).length;
  return (
    <Card labelledBy="milestones-title">
      <CardHeader id="milestones-title" title="Goals & milestones" subtitle={next ? `${reached} of ${list.length} reached · next: ${next.label.toLowerCase()}` : 'You’ve reached your goal.'} />
      <ul className="flex flex-wrap gap-2">
        {list.map((m) => (
          <li key={m.key} title={m.hint}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${m.reached ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : m === next ? 'bg-ink-50 border-ink-100 text-ink-800' : 'bg-white border-slate-200 text-slate-400'}`}>
            <Icon name={m.reached ? 'check' : m.key === 'goal' ? 'flag' : 'clock'} className="w-3.5 h-3.5" />
            {m.label}
          </li>
        ))}
      </ul>
    </Card>
  );
}
