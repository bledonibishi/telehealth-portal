'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * A dropdown that opens just below its field (the browser's own list pops up over it and ignores our
 * styling). Keyboard: arrows move, Enter/Space choose, Escape closes, typing the first letter jumps.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  ariaLabel,
  size = 'md',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** `sm` for filter rows and toolbars. */
  size?: 'md' | 'sm';
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [dropUp, setDropUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const enabled = useMemo(() => options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0), [options]);

  const show = () => {
    if (disabled) return;
    const rect = root.current?.getBoundingClientRect();
    // Flip upwards when there isn't room below the field for the list.
    setDropUp(!!rect && window.innerHeight - rect.bottom < 280 && rect.top > 280);
    setActive(Math.max(options.findIndex((o) => o.value === value), enabled[0] ?? -1));
    setOpen(true);
  };
  const choose = (i: number) => {
    const option = options[i];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };
  const move = (dir: 1 | -1) => {
    const at = enabled.indexOf(active);
    const next = enabled[Math.min(Math.max(at + dir, 0), enabled.length - 1)];
    if (next !== undefined) setActive(next);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
    else if (e.key === 'Home') (e.preventDefault(), setActive(enabled[0] ?? -1));
    else if (e.key === 'End') (e.preventDefault(), setActive(enabled[enabled.length - 1] ?? -1));
    else if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), choose(active));
    else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), setOpen(false));
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1) {
      const next = enabled.find((i) => options[i].label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (next !== undefined) setActive(next);
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left transition-colors ${size === 'sm' ? 'h-9 text-[13px]' : 'h-10 text-sm'} focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 ${
          open ? 'border-brand-500 ring-2 ring-brand-500' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>{selected?.label ?? placeholder}</span>
        <svg className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          className={`absolute left-0 z-30 min-w-full w-max max-w-xs max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled}
              onMouseEnter={() => !o.disabled && setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              className={`flex items-center justify-between gap-3 px-3 ${size === 'sm' ? 'py-1.5 text-[13px]' : 'py-2 text-sm'} ${
                o.disabled ? 'cursor-not-allowed text-gray-300' : 'cursor-pointer text-gray-800'
              } ${i === active && !o.disabled ? 'bg-brand-50' : ''}`}
            >
              <span className="whitespace-nowrap">{o.label}</span>
              {o.value === value && (
                <svg className="h-4 w-4 shrink-0 text-brand-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
