'use client';

import { useEffect, useRef } from 'react';
import { saveBmiCarry } from '@/lib/bmi-carry';
import { DICT, type Lang } from '@/lib/i18n';

export default function BmiWidget({ lang = 'en' }: { lang?: Lang }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = DICT[lang].bmi;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.innerHTML = `<div class="pvb-field"><div class="pvb-row"><span>${t.height}</span><strong data-v="h"></strong></div><input class="pvb-range" type="range" min="140" max="210" value="170" data-r="h" aria-label="${t.height}"></div><div class="pvb-field"><div class="pvb-row"><span>${t.weight}</span><strong data-v="w"></strong></div><input class="pvb-range" type="range" min="45" max="200" value="92" data-r="w" aria-label="${t.weight}"></div><div class="pvb-result" data-tone="good"><div><div class="pvb-label">${t.yourBmi}</div><div class="pvb-num" data-v="bmi"></div></div><div class="pvb-status" data-v="status"></div></div><div class="pvb-scale"><div class="pvb-track"></div><div class="pvb-marker" data-v="marker"></div></div><div class="pvb-ticks"><span style="left:14%">18.5</span><span style="left:40%">25</span><span style="left:60%">30</span><span style="left:80%">35</span></div><p class="pvb-note" data-v="note"></p><a class="pvb-cta" href="/glp1-eligibility">${t.cta}</a><div class="pvb-small">${t.small}</div>`;

    const q = (s: string) => el.querySelector<HTMLElement>(s)!;
    const hR = el.querySelector<HTMLInputElement>('[data-r=h]')!;
    const wR = el.querySelector<HTMLInputElement>('[data-r=w]')!;

    const fillR = (r: HTMLInputElement) => {
      const pct = ((+r.value - +r.min) / (+r.max - +r.min)) * 100;
      r.style.setProperty('--p', pct + '%');
    };

    const upd = () => {
      const h = +hR.value, w = +wR.value;
      const bmi = Math.round((w / Math.pow(h / 100, 2)) * 10) / 10;
      q('[data-v=h]').textContent = h + ' cm';
      q('[data-v=w]').textContent = w + ' kg';
      q('[data-v=bmi]').textContent = bmi.toFixed(1);
      q('[data-v=marker]').style.left = Math.max(0, Math.min(100, ((bmi - 15) / 25) * 100)) + '%';

      let tone: string, status: string, note: string;
      if (bmi >= 30) {
        tone = 'good'; status = t.good;
        note = t.noteGood;
      } else if (bmi >= 27) {
        tone = 'maybe'; status = t.maybe;
        note = t.noteMaybe;
      } else {
        tone = 'low'; status = t.low;
        note = t.noteLow;
      }

      q('.pvb-result').setAttribute('data-tone', tone);
      q('[data-v=status]').textContent = status;
      q('[data-v=note]').textContent = note;
      fillR(hR); fillR(wR);
    };

    // The assessment opens on these same two numbers, so they go with the click instead of being asked again. They are
    // handed over in this tab's storage, not the address: a URL with a weight in it would reach analytics and history.
    q('.pvb-cta').addEventListener('click', () => saveBmiCarry(+hR.value, +wR.value));

    hR.addEventListener('input', upd);
    wR.addEventListener('input', upd);
    upd();
  }, [lang]);

  return <div ref={ref} />;
}
