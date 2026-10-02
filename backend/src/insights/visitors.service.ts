import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TopOfFunnel {
  /** Distinct people who saw the landing page, plus anyone who started the quiz without it (they were visitors too). */
  visitors: number;
  /** Distinct people who answered the first quiz question. */
  quizStarted: number;
}

export interface TopOfFunnelResult {
  configured: boolean;
  data: TopOfFunnel | null;
  /** Set when PostHog is configured but refused or failed the request. */
  error: string | null;
}

const CACHE_MS = 5 * 60_000;
const FAILURE_CACHE_MS = 60_000;

/**
 * Website visits and quiz starts aren't stored in our own database, so they are read from
 * PostHog's query API. Needs a *personal* API key (not the project key the website uses to send
 * events), which is why this is separate from PostHogService:
 *   POSTHOG_PERSONAL_API_KEY   a personal API key with "Query: read" access
 *   POSTHOG_PROJECT_ID         the project's numeric id (Project settings)
 *   POSTHOG_HOST               as for event capture; us.i.posthog.com → us.posthog.com for queries
 * The website sends `$pageview` (on `/`) and `quiz_started`.
 */
@Injectable()
export class VisitorsService {
  private readonly logger = new Logger(VisitorsService.name);
  private cache = new Map<number, { at: number; value: TopOfFunnelResult }>();

  constructor(private config: ConfigService) {}

  private get settings() {
    const key = this.config.get<string>('POSTHOG_PERSONAL_API_KEY')?.trim();
    const projectId = this.config.get<string>('POSTHOG_PROJECT_ID')?.trim();
    if (!key || !projectId) return null;
    const ingest = this.config.get<string>('POSTHOG_HOST')?.trim() || 'https://us.i.posthog.com';
    return { key, projectId, host: ingest.replace('.i.posthog.com', '.posthog.com').replace(/\/$/, '') };
  }

  async topOfFunnel(periodDays: number, now = Date.now()): Promise<TopOfFunnelResult> {
    const settings = this.settings;
    if (!settings) return { configured: false, data: null, error: null };

    const hit = this.cache.get(periodDays);
    if (hit && now - hit.at < (hit.value.error ? FAILURE_CACHE_MS : CACHE_MS)) return hit.value;

    let value: TopOfFunnelResult;
    try {
      value = { configured: true, data: await this.query(settings, periodDays), error: null };
    } catch (err: any) {
      const message = String(err?.message ?? err);
      this.logger.error(`Could not read website visits from PostHog: ${message}`);
      value = { configured: true, data: null, error: message };
    }
    this.cache.set(periodDays, { at: now, value });
    return value;
  }

  private async query(s: { key: string; projectId: string; host: string }, periodDays: number): Promise<TopOfFunnel> {
    const landing = `event = '$pageview' AND properties.$pathname = '/'`;
    // periodDays is validated to a small whole number by the resolver, so it is safe to inline.
    const hogql = `
      SELECT
        uniqIf(person_id, ${landing} OR event = 'quiz_started') AS visitors,
        uniqIf(person_id, event = 'quiz_started') AS quiz_started
      FROM events
      WHERE event IN ('$pageview', 'quiz_started') AND timestamp >= now() - toIntervalDay(${Math.floor(periodDays)})`;

    const res = await fetch(`${s.host}/api/projects/${encodeURIComponent(s.projectId)}/query/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`PostHog answered ${res.status}${res.status === 401 || res.status === 403 ? ' — check POSTHOG_PERSONAL_API_KEY' : ''}`);

    const body = (await res.json()) as { results?: unknown[][] };
    const row = body.results?.[0];
    if (!row) throw new Error('PostHog returned no rows');
    return { visitors: Number(row[0]) || 0, quizStarted: Number(row[1]) || 0 };
  }
}
