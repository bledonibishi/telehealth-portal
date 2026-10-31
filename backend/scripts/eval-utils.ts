/** What the eval scripts (support-bot-eval, urgency-eval, lab-reader-eval) share: their options, the env file, running a few calls at a time. */
import { existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PARALLEL = 4;

/** `[filter] [--runs N] [--out file.json]`: which cases, how many times each, and where to save the results. */
export function evalArgs(defaultRuns = 5) {
  const argv = process.argv.slice(2);
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    argv.splice(i, 2);
    return v;
  };
  const runs = Number(value('--runs') ?? defaultRuns);
  const out = value('--out');
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs needs a whole number, 1 or more');
  // A mistyped flag (--run 1) would otherwise be taken as the name filter, match nothing, and "pass".
  const unknown = argv.find((a) => a.startsWith('--'));
  if (unknown) throw new Error(`Unknown option ${unknown}. The options are a name filter, --runs N and --out file.json`);
  if (argv.length > 1) throw new Error(`Give at most one name filter (got: ${argv.join(' ')})`);
  const filter = argv[0]?.toLowerCase();
  return { runs, out, filter: filter ?? '', match: (name: string) => !filter || name.toLowerCase().includes(filter) };
}

/** Stops the run when the filter picked nothing: an empty run must never be reported as a pass. */
export function requireCases(count: number, filter: string) {
  if (count > 0) return;
  console.error(`No case matches "${filter}". Nothing was run.`);
  process.exit(1);
}

/** backend/.env, for the AI key and switches (the made-up cases are all that is sent). */
export function loadBackendEnv() {
  const envFile = resolve(__dirname, '../.env');
  if (existsSync(envFile)) (process as unknown as { loadEnvFile(path: string): void }).loadEnvFile(envFile);
}

/** Runs the jobs a few at a time, so a full run takes minutes rather than most of an hour. */
export async function pool<T>(jobs: Array<() => Promise<T>>): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < jobs.length) {
        const i = next++;
        results[i] = await jobs[i]();
      }
    }),
  );
  return results;
}

export function saveResults(out: string | undefined, data: unknown) {
  if (!out) return;
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), ...(data as object) }, null, 2));
  console.log(`Saved to ${out}.`);
}
