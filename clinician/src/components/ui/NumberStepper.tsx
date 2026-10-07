'use client';

import { NumberField } from './NumberField';

/** A whole number with − and + buttons beside a box you can also type in (see NumberField). */
export function NumberStepper({
  value,
  onChange,
  min,
  max,
  emptyValue = min,
  placeholder,
  ariaLabel,
  className = '',
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  emptyValue?: number;
  placeholder?: string;
  ariaLabel?: string;
  /** Sizing for the whole control, e.g. `w-40`; it grows to fill its row when left out. */
  className?: string;
}) {
  const step = 'flex w-10 shrink-0 items-center justify-center text-base leading-none text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-white';
  return (
    <div
      className={`flex h-10 items-stretch overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-300 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500 ${className}`}
    >
      <button type="button" aria-label={ariaLabel ? `${ariaLabel} −` : 'Decrease'} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className={step}>
        −
      </button>
      <NumberField
        ariaLabel={ariaLabel}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        emptyValue={emptyValue}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-x border-gray-200 bg-white text-center text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
      />
      <button type="button" aria-label={ariaLabel ? `${ariaLabel} +` : 'Increase'} disabled={value >= max} onClick={() => onChange(Math.min(max, Math.max(min, value + 1)))} className={step}>
        +
      </button>
    </div>
  );
}
