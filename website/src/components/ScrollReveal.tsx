'use client';

import { useEffect } from 'react';

const SEL = [
  '.pv-hero-copy', '.pv-hero-visual', '.pv-feature', '.th-section-head',
  '.th-product-card-hrt', '.th-product-card-glp', '.pv-bmi-shell',
  '.th-step-card', '.th-trust-band', '.pv-page-head', '.pv-stats-split',
  '.pv-stat', '.pv-info-card', '.pv-contact-photo-wrap', '.pv-form-card',
].join(',');

export default function ScrollReveal() {
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.pv-anim').forEach((el) => {
        el.classList.add('pv-in');
      });
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const t = en.target as HTMLElement;
          t.classList.add('pv-in');
          io.unobserve(t);
          setTimeout(() => {
            t.classList.remove('pv-anim', 'pv-in');
            t.style.transitionDelay = '';
          }, 1300);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );

    document.querySelectorAll(SEL).forEach((el, i) => {
      (el as HTMLElement).style.transitionDelay = (i % 4) * 90 + 'ms';
      io.observe(el);
    });

    /* count-up for stats */
    const statNums = document.querySelectorAll<HTMLElement>('.pv-stat-num, .pv-float-big');
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const numEl = en.target as HTMLElement;
          cio.unobserve(numEl);
          const raw = numEl.getAttribute('data-final') ?? numEl.textContent ?? '';
          numEl.setAttribute('data-final', raw);
          const m = /^(\D*)(\d+(?:\.\d+)?)(.*)$/.exec(raw);
          if (!m) return;
          const pre = m[1], target = parseFloat(m[2]), suf = m[3];
          const dec = (m[2].split('.')[1] ?? '').length;
          const from = target === 0 ? 12 : 0;
          const start = performance.now();
          const dur = 1700;
          const step = (now: number) => {
            const p = Math.min(1, (now - start) / dur);
            const e = 1 - Math.pow(1 - p, 3);
            const v = from + (target - from) * e;
            numEl.textContent = pre + (dec ? v.toFixed(dec) : Math.round(v)) + suf;
            if (p < 1) requestAnimationFrame(step);
            else numEl.textContent = raw;
          };
          requestAnimationFrame(step);

          /* stat bar */
          const card = numEl.closest('.pv-stat');
          if (card) {
            requestAnimationFrame(() => card.classList.add('is-counted'));
          }
        });
      },
      { threshold: 0.4 },
    );
    statNums.forEach((el) => cio.observe(el));

    return () => { io.disconnect(); cio.disconnect(); };
  }, []);

  return null;
}
