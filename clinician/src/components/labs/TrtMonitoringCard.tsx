'use client';

import { format, formatDistanceToNow, isPast } from 'date-fns';
import { KIND_LABEL, type TrtMonitoring } from './labs-format';

/** The testosterone blood-test schedule for one patient, and whether repeats are on hold. */
export function TrtMonitoringCard({ monitoring }: { monitoring: TrtMonitoring }) {
  return (
    <div className={`rounded-xl border p-4 ${monitoring.refillsOnHold ? 'border-danger-500/40 bg-danger-50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Testosterone monitoring</p>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${monitoring.refillsOnHold ? 'bg-danger-500 text-white' : 'bg-green-50 text-green-700'}`}>
          {monitoring.refillsOnHold ? 'Repeats on hold' : 'Repeats allowed'}
        </span>
      </div>
      <p className="text-xs text-gray-400 mt-0.5">On treatment since {format(new Date(monitoring.startedAt), 'd MMM yyyy')}</p>

      {monitoring.holdReasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {monitoring.holdReasons.map((r) => <li key={r} className="text-xs text-danger-900">⛔ {r}</li>)}
        </ul>
      )}
      {monitoring.warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {monitoring.warnings.map((w) => <li key={w} className="text-xs text-amber-800">⚠️ {w}</li>)}
        </ul>
      )}

      <table className="w-full text-sm mt-3">
        <thead>
          <tr className="text-left text-xs text-gray-400">
            <th className="font-medium py-1">Test</th>
            <th className="font-medium py-1">Last result</th>
            <th className="font-medium py-1">Next due</th>
          </tr>
        </thead>
        <tbody>
          {monitoring.labs.map((l) => (
            <tr key={l.kind} className="border-t border-gray-200/70">
              <td className="py-1.5 text-gray-700">{KIND_LABEL[l.kind] ?? l.kind}</td>
              <td className="py-1.5 text-gray-700">
                {l.lastValue != null ? `${l.lastValue} ${l.lastUnit ?? ''}` : <span className="text-gray-400">None yet</span>}
                {l.lastCollectedAt && <span className="text-xs text-gray-400"> · {format(new Date(l.lastCollectedAt), 'd MMM yyyy')}</span>}
              </td>
              <td className={`py-1.5 ${l.overdue ? 'text-danger-500 font-medium' : isPast(new Date(l.dueAt)) ? 'text-amber-700' : 'text-gray-700'}`}>
                {format(new Date(l.dueAt), 'd MMM yyyy')}
                <span className="text-xs text-gray-400"> · {formatDistanceToNow(new Date(l.dueAt), { addSuffix: true })}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
