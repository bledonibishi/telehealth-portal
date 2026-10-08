'use client';

import { Dialog } from '@/components/common/Dialog';

const STEPS: [string, string][] = [
  ['Get ready', 'Wash your hands. Check the label shows your medicine and dose, the liquid is clear and colourless, and it hasn’t expired. If it’s cloudy, has particles, or the pen is damaged, don’t use it.'],
  ['Prepare the pen', 'Follow the leaflet in your box for your pen: some need a new needle each time, some are ready to use. Never share a pen or needle with anyone.'],
  ['Choose a spot', 'Belly (at least a hand’s width from your navel), front or outer thigh, or the back of the upper arm (someone may need to help). Use a different spot from last time, and avoid skin that is bruised, sore, scarred or hard.'],
  ['Clean the skin', 'Wipe the spot with an alcohol wipe and let it dry by itself.'],
  ['Inject', 'Press the pen flat against your skin and press the button as your leaflet shows. Keep it still for as long as the leaflet says (it’s usually a slow count of several seconds) so the whole dose goes in.'],
  ['Finish', 'Take the pen away and don’t rub the spot. Put the used needle or pen in a sharps container, not the bin. A small drop of blood or a little redness is normal.'],
  ['Log it', 'Mark the dose as taken here and choose where you injected, so we can suggest a different spot next time.'],
];

/** A short, product-neutral walkthrough. The leaflet that comes with the pen always has the final say. */
export function InjectionGuide({ onClose, requiresColdChain }: { onClose: () => void; requiresColdChain: boolean }) {
  return (
    <Dialog title="How to inject" onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">Nervous about your first one? That’s very common. Take your time, and message your care team if you’d like to talk it through.</p>
      <ol className="space-y-3">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold flex items-center justify-center" aria-hidden>{i + 1}</span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{title}</p>
              <p className="text-sm text-slate-600 mt-0.5">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      {requiresColdChain && <p className="text-xs text-slate-500 mt-4">Keep unused pens in the fridge (2–8°C), never frozen.</p>}
      <p className="text-xs text-slate-500 mt-3 bg-slate-50 rounded-lg p-3">
        These are general steps. Your pen’s leaflet is the guide for your exact device. Severe stomach pain that doesn’t go away, trouble breathing, or swelling of the face or throat is an emergency: call 112.
      </p>
    </Dialog>
  );
}
