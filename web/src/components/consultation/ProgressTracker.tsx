import { format } from 'date-fns';

type Prescription = {
  dispatchedAt?: string | null;
  outForDeliveryAt?: string | null;
  deliveredAt?: string | null;
} | null;

type Step = { label: string; when?: string | null };

// Where the request stands, as five steps. `done` steps are complete; the next one is in progress.
// `stopped` marks a step that ended the journey (a declined request).
export function trackerSteps(
  status: string,
  submittedAt: string,
  updatedAt: string,
  prescription: Prescription,
): { steps: Step[]; done: number; attention: boolean; stopped: boolean } {
  const decisionLabel = status === 'DECLINED' ? 'Not approved' : 'Approved';
  const steps: Step[] = [
    { label: 'Request sent', when: submittedAt },
    { label: 'Clinician review' },
    { label: decisionLabel, when: status === 'APPROVED' || status === 'DECLINED' ? updatedAt : null },
    { label: 'Dispatched', when: prescription?.dispatchedAt },
    { label: 'Delivered', when: prescription?.deliveredAt },
  ];

  if (status === 'DECLINED') return { steps, done: 2, attention: false, stopped: true };
  if (status === 'APPROVED') {
    const done = prescription?.deliveredAt ? 5 : prescription?.dispatchedAt ? 4 : 3;
    return { steps, done, attention: false, stopped: false };
  }
  // Submitted, in review, or waiting on the patient.
  steps[1].when = null;
  return { steps, done: 1, attention: status === 'MORE_INFO_REQUESTED', stopped: false };
}

function Check() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

export function ProgressTracker({
  steps, done, attention, stopped,
}: {
  steps: Step[];
  done: number;
  attention: boolean;
  stopped: boolean;
}) {
  // The line runs between the centres of the first and last circles (each sits in a fifth of the width).
  const fill = (Math.max(done - 1, 0) / (steps.length - 1)) * 100;

  return (
    <div className="relative" role="list" aria-label="Progress">
      <div className="absolute top-4 left-[10%] right-[10%] h-1 rounded-full bg-slate-200/80" />
      <div
        className="absolute top-4 left-[10%] h-1 rounded-full bg-brand-600 transition-all duration-700"
        style={{ width: `${fill * 0.8}%` }}
      />
      <div className="relative grid grid-cols-5">
        {steps.map((step, i) => {
          const isDone = i < done;
          const isStopPoint = stopped && i === done;
          const isCurrent = !stopped && i === done;
          const circle = isStopPoint
            ? 'bg-rose-100 text-rose-600 ring-4 ring-rose-50'
            : isDone
              ? 'bg-brand-600 text-white'
              : isCurrent
                ? attention
                  ? 'bg-amber-100 text-amber-700 ring-4 ring-amber-50'
                  : 'bg-white text-brand-600 ring-4 ring-brand-100 border-2 border-brand-600'
                : 'bg-slate-100 text-slate-400';
          return (
            <div key={step.label} role="listitem" className="flex flex-col items-center text-center px-0.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${circle}`}>
                {isStopPoint ? '✕' : isDone ? <Check /> : isCurrent && !attention ? <span className="w-2.5 h-2.5 rounded-full bg-brand-600 animate-pulse" /> : isCurrent ? '!' : i + 1}
              </div>
              <span className={`mt-2 text-[11px] sm:text-xs leading-tight ${isDone || isCurrent || isStopPoint ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>
                {step.label}
              </span>
              <span className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 h-3.5">
                {step.when ? format(new Date(step.when), 'd MMM') : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
