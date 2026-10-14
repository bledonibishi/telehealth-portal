'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { TREATMENTS } from '@/lib/treatments';

/**
 * The hero's main button. The page offers three programmes, so instead of sending everyone to one of them the button
 * asks which one, with the same three choices as the header.
 */
export default function HeroChooser() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="pv-chooser" ref={box}>
      <button type="button" className="btn-primary" aria-expanded={open} aria-controls="pv-chooser-list" onClick={() => setOpen((o) => !o)}>
        Check eligibility {open ? '↑' : '→'}
      </button>
      {open && (
        <div className="pv-chooser-list" id="pv-chooser-list" role="menu">
          <div className="pv-chooser-title">What would you like help with?</div>
          {TREATMENTS.map((t) => (
            <Link key={t.key} href={t.href} role="menuitem" className={`pv-treat pv-treat--${t.key}`}>
              <span className="pv-treat-ico">{t.icon}</span>
              <span className="pv-treat-text">
                <span className="pv-treat-name">
                  {t.name} <span className="pv-treat-abbr">({t.abbr})</span>
                </span>
                <span className="pv-treat-sub">{t.full}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
