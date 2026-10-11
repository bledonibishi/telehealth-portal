import { cx, loadingConfig } from './config';

/**
 * Grey placeholder shapes that stand in for content while it loads. `Skeleton` is the building block (give it a size
 * and shape with `className`); the others are ready-made arrangements. To add a new one, compose Skeletons in a new
 * function here and export it from index.ts.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse motion-reduce:animate-none rounded-md', loadingConfig.skeleton, className)} />;
}

/** Announces the wait once, for the whole placeholder, and keeps the individual shapes silent. */
function Region({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SkeletonText({ lines = 3, label = 'Loading…', className }: { lines?: number; label?: string; className?: string }) {
  return (
    <Region label={label} className={cx('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cx('h-3', i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </Region>
  );
}

export function SkeletonAvatar({ className }: { className?: string }) {
  return <Skeleton className={cx('h-8 w-8 rounded-full', className)} />;
}

/** Rows with a round avatar, two lines of text and a pill: a patient list, a queue, a conversation list. */
export function SkeletonList({ rows = 5, label = 'Loading…', className }: { rows?: number; label?: string; className?: string }) {
  return (
    <Region label={label} className={cx('overflow-hidden rounded-lg border border-slate-500/20', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-slate-500/20 px-4 py-3.5 last:border-0">
          <SkeletonAvatar />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-56 max-w-full" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </Region>
  );
}

/** A grid of cells, for a table whose columns are known. */
export function SkeletonTable({ rows = 6, cols = 5, label = 'Loading…', className }: { rows?: number; cols?: number; label?: string; className?: string }) {
  const grid = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  return (
    <Region label={label} className={cx('overflow-hidden rounded-lg border border-slate-500/20', className)}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="grid gap-4 border-b border-slate-500/20 px-4 py-3.5 last:border-0" style={grid}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cx('h-3', c === 0 ? 'w-3/4' : 'w-1/2')} />
          ))}
        </div>
      ))}
    </Region>
  );
}

/** A card-shaped block: a title line and a few lines of text. */
export function SkeletonCard({ lines = 3, label = 'Loading…', className }: { lines?: number; label?: string; className?: string }) {
  return (
    <Region label={label} className={cx('space-y-3 rounded-lg border border-slate-500/20 p-5', className)}>
      <Skeleton className="h-4 w-1/3" />
      <div className="space-y-2">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={cx('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </Region>
  );
}

/** A figure with a caption: a dashboard metric. */
export function SkeletonStat({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <Region label={label} className={cx('space-y-2 rounded-lg border border-slate-500/20 p-5', className)}>
      <Skeleton className="h-1 w-8 rounded-full" />
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-3.5 w-32" />
    </Region>
  );
}

/** An icon box beside two lines: a summary tile. */
export function SkeletonTile({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <Region label={label} className={cx('flex items-start gap-3 rounded-lg border border-slate-500/20 p-4', className)}>
      <Skeleton className="h-9 w-9 shrink-0" />
      <div className="flex-1 space-y-2 pt-0.5">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
    </Region>
  );
}

/**
 * Body rows for a table that keeps its real header: put it inside `<tbody>` while the data loads. `avatar` gives the
 * first cell a round picture and two lines, like a patient or customer column.
 */
export function SkeletonTableRows({ rows = 6, cols, avatar = false, label = 'Loading…' }: { rows?: number; cols: number; avatar?: boolean; label?: string }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-busy="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="px-4 py-4 sm:px-6">
              {r === 0 && c === 0 && <span role="status" className="sr-only">{label}</span>}
              {c === 0 && avatar ? (
                <div className="flex items-center gap-3">
                  <SkeletonAvatar />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-44" />
                  </div>
                </div>
              ) : (
                <Skeleton className={cx('h-3', c === 0 ? 'w-3/4' : c % 2 ? 'w-1/2' : 'w-2/3')} />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Bubbles on alternating sides: a conversation that is loading. */
export function SkeletonMessages({ label = 'Loading…', className }: { label?: string; className?: string }) {
  const bubbles = ['w-2/3', 'w-1/2', 'w-3/5', 'w-2/5'];
  return (
    <Region label={label} className={cx('space-y-3', className)}>
      {bubbles.map((w, i) => (
        <div key={i} className={cx('flex', i % 2 ? 'justify-end' : 'justify-start')}>
          <Skeleton className={cx('h-10 rounded-2xl', w)} />
        </div>
      ))}
    </Region>
  );
}
