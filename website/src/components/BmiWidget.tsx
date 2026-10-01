'use client';

import { useEffect, useRef } from 'react';

export default function BmiWidget() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.innerHTML =
      '<div class="pvb-field"><div class="pvb-row"><span>Height</span><strong data-v="h"></strong></div><input class="pvb-range" type="range" min="140" max="210" value="170" data-r="h" aria-label="Height"></div>' +
      '<div class="pvb-field"><div class="pvb-row"><span>Weight</span><strong data-v="w"></strong></div><input class="pvb-range" type="range" min="45" max="200" value="92" data-r="w" aria-label="Weight"></div>' +
      '<div class="pvb-result" data-tone="good"><div><div class="pvb-label">Your BMI</div><div class="pvb-num" data-v="bmi"></div></div><div class="pvb-status" data-v="status"></div></div>' +
      '<div class="pvb-scale"><div class="pvb-track"></div><div class="pvb-marker" data-v="marker"></div></div>' +
      '<div class="pvb-ticks"><span style="left:14%">18.5</span><span style="left:40%">25</span><span style="left:60%">30</span><span style="left:80%">35</span></div>' +
      '<p class="pvb-note" data-v="note"></p>' +
      '<a class="pvb-cta" href="/glp1-eligibility">Check my eligibility →</a>' +
      '<div class="pvb-small">Takes about 2 minutes · Reviewed by a licensed doctor</div>';

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
        tone = 'good'; status = 'In the treatment range';
        note = 'A BMI of 30 or above is where GLP-1 treatment is usually considered. Your doctor will also review your age, medical history and current medication.';
      } else if (bmi >= 27) {
        tone = 'maybe'; status = 'May qualify';
        note = 'Between 27 and 29.9, treatment may be considered if you also have a condition like type 2 diabetes or high blood pressure.';
      } else {
        tone = 'low'; status = 'Below the range';
        note = 'GLP-1 treatment is generally only prescribed for a BMI of 27 or above.';
      }

      q('.pvb-result').setAttribute('data-tone', tone);
      q('[data-v=status]').textContent = status;
      q('[data-v=note]').textContent = note;
      fillR(hR); fillR(wR);
    };

    hR.addEventListener('input', upd);
    wR.addEventListener('input', upd);
    upd();
  }, []);

  return <div ref={ref} />;
}
