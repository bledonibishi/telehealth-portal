export function RedFlagBanner({ redFlags }: { redFlags: Array<{ id: string; description: string; severity: string }> }) {
  if (redFlags.length === 0) return null;

  const critical = redFlags.filter((f) => f.severity === 'CRITICAL');
  const warnings = redFlags.filter((f) => f.severity === 'WARNING');

  return (
    <div className="space-y-2 mb-6">
      {critical.map((f) => (
        <div key={f.id} className="flex items-start gap-3 bg-danger-50 border border-danger-500 rounded-md px-4 py-3">
          <span className="mt-0.5 w-4 h-4 rounded-full bg-danger-500 flex-shrink-0" />
          <div>
            <span className="text-xs font-semibold text-danger-500 uppercase tracking-wide">Critical</span>
            <p className="text-sm text-danger-900 mt-0.5">{f.description}</p>
          </div>
        </div>
      ))}
      {warnings.map((f) => (
        <div key={f.id} className="flex items-start gap-3 bg-warn-50 border border-warn-500 rounded-md px-4 py-3">
          <span className="mt-0.5 w-4 h-4 rounded-full bg-warn-500 flex-shrink-0" />
          <div>
            <span className="text-xs font-semibold text-warn-900 uppercase tracking-wide">Warning</span>
            <p className="text-sm text-warn-900 mt-0.5">{f.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
