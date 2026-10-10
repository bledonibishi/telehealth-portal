'use client';

/**
 * The search box every list uses: magnifier on the left, a clear button once something is typed, Escape clears.
 * Same height as `Select` (sm) so a search and its filters line up. `className` sets the width.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  clearLabel = 'Clear search',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  clearLabel?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="9" cy="9" r="5.5" />
        <path d="M13.5 13.5L17 17" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onChange(''); }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-9 text-[13px] text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label={clearLabel} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700">
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
        </button>
      )}
    </div>
  );
}
