'use client';

import { useEffect, useState } from 'react';

/**
 * A whole-number box you can clear and retype. While it is empty the value is `emptyValue` (and the
 * placeholder shows it greyed), and it stays empty when you click away; out-of-range numbers are held to
 * min..max.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  emptyValue = min,
  placeholder,
  className,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** What the value is while the box is empty. */
  emptyValue?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(String(value));

  // Follow outside changes (a template filling the field) without fighting the typing in progress.
  useEffect(() => {
    setText((t) => (t === '' ? (value === emptyValue ? '' : String(value)) : Number(t) === value ? t : String(value)));
  }, [value, emptyValue]);

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      placeholder={placeholder ?? String(emptyValue)}
      value={text}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
        setText(digits);
        onChange(digits === '' ? emptyValue : Math.min(Math.max(Number(digits), min), max));
      }}
      // An out-of-range number is shown as the value actually kept; an empty box stays empty.
      onBlur={() => setText((t) => (t === '' ? '' : String(value)))}
      onFocus={(e) => e.target.select()}
      className={className}
    />
  );
}
