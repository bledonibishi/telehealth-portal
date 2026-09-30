function FlagIcon({ className }: { className: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

export function RedFlagBanner({ redFlags }: { redFlags: Array<{ id: string; description: string; severity: string }> }) {
  if (redFlags.length === 0) return null;

  const critical = redFlags.filter((f) => f.severity === 'CRITICAL');
  const warnings = redFlags.filter((f) => f.severity === 'WARNING');

  return (
    <section aria-label="Clinical flags" className="space-y-2">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Clinical flags · {redFlags.length}
      </h2>
      {critical.map((f) => (
        <div key={f.id} className="flex items-start gap-3 bg-danger-50 border border-danger-500 border-l-4 rounded-lg px-4 py-3">
          <FlagIcon className="w-5 h-5 mt-0.5 shrink-0 text-danger-500" />
          <div>
            <span className="text-[11px] font-semibold text-danger-500 uppercase tracking-wide">Critical</span>
            <p className="text-sm text-danger-900 mt-0.5">{f.description}</p>
          </div>
        </div>
      ))}
      {warnings.map((f) => (
        <div key={f.id} className="flex items-start gap-3 bg-warn-50 border border-warn-500/60 border-l-4 border-l-warn-500 rounded-lg px-4 py-3">
          <FlagIcon className="w-5 h-5 mt-0.5 shrink-0 text-warn-500" />
          <div>
            <span className="text-[11px] font-semibold text-warn-900 uppercase tracking-wide">Warning</span>
            <p className="text-sm text-warn-900 mt-0.5">{f.description}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
