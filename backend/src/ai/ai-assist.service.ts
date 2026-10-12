import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LlmTracingService } from '../langfuse/llm-tracing.service';
import { SUPPORTS_EFFORT, SUPPORTS_FALLBACKS } from '../onboarding/proof-reader.service';

/**
 * The AI helpers. None is on until it is named in AI_ENABLED_FEATURES (comma separated, or "all"): an API key that is
 * already set for another feature (the document readers) never switches these on, because they send patients' messages
 * and records to an outside AI service. AI_DISABLED_FEATURES can still veto one that "all" would turn on.
 */
export type AiFeature = 'brief' | 'reply' | 'translate' | 'urgency' | 'search' | 'labs';
export const AI_FEATURES: AiFeature[] = ['brief', 'reply', 'translate', 'urgency', 'search', 'labs'];

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Whether a helper has been switched on, and not vetoed. (Whether there is a key is checked separately.) */
export function featureSwitchedOn(config: { get: (key: string) => string | undefined }, feature: AiFeature): boolean {
  const on = list(config.get('AI_ENABLED_FEATURES'));
  return (on.includes('all') || on.includes(feature)) && !list(config.get('AI_DISABLED_FEATURES')).includes(feature);
}

// These tasks are summarising, drafting and translating short texts, with a person checking the result. The mid-tier model
// is enough. Override all with AI_ASSIST_MODEL, or one helper with AI_MODEL_<HELPER> (BRIEF, REPLY, TRANSLATE, URGENCY, SEARCH).
export const DEFAULT_AI_ASSIST_MODEL = 'claude-sonnet-5-5';
const DEADLINE_MS = 60_000;

export type AiResult<T> = { status: 'COMPLETED'; data: T; model: string } | { status: 'DISABLED' | 'FAILED'; reason: string };

/**
 * The one place the AI helpers call Claude from: it knows whether a feature is on, asks for JSON that fits a schema,
 * and never lets what the model said or was sent reach a trace (a trace records how a call went, not what it was about).
 * Without ANTHROPIC_API_KEY, or with a feature not switched on, nothing is sent anywhere and callers get DISABLED.
 *
 * What goes in: the text of a message, a record's facts. That is health data going to an outside AI service, so these
 * features need the provider agreement and patient-facing wording to be in place before they are switched on in production.
 */
@Injectable()
export class AiAssistService {
  private readonly logger = new Logger(AiAssistService.name);
  private client: Anthropic | null = null;

  constructor(private config: ConfigService, @Optional() private tracing: LlmTracingService = new LlmTracingService()) {}

  /** The model for one helper: AI_MODEL_<HELPER> (for example AI_MODEL_SEARCH), else AI_ASSIST_MODEL, else the default. */
  modelFor(feature: AiFeature): string {
    return this.config.get<string>(`AI_MODEL_${feature.toUpperCase()}`)?.trim() || this.config.get<string>('AI_ASSIST_MODEL')?.trim() || DEFAULT_AI_ASSIST_MODEL;
  }

  get model(): string {
    return this.modelFor('brief');
  }

  get configured(): boolean {
    return !!this.config.get<string>('ANTHROPIC_API_KEY');
  }

  /** Which helpers are on right now: those named in AI_ENABLED_FEATURES, and only with a key. */
  enabledFeatures(): AiFeature[] {
    if (!this.configured) return [];
    return AI_FEATURES.filter((f) => featureSwitchedOn({ get: (k) => this.config.get<string>(k) }, f));
  }

  isEnabled(feature: AiFeature): boolean {
    return this.enabledFeatures().includes(feature);
  }

  private getClient(): Anthropic {
    this.client ??= new Anthropic({ apiKey: this.config.get<string>('ANTHROPIC_API_KEY'), timeout: DEADLINE_MS, maxRetries: 1 });
    return this.client;
  }

  /**
   * Asks for JSON matching `schema`. `system` is our instructions; `user` carries the record or message text and is never
   * traced. `summarise` says what a trace may show of the answer (counts and flags, never its words).
   */
  async json<T>(opts: {
    feature: AiFeature;
    system: string;
    user: string;
    schema: Record<string, unknown>;
    maxTokens?: number;
    patientId?: string;
    summarise?: (data: T) => unknown;
  }): Promise<AiResult<T>> {
    if (!this.isEnabled(opts.feature)) return { status: 'DISABLED', reason: 'This AI helper isn’t switched on' };
    const model = this.modelFor(opts.feature);
    const maxTokens = opts.maxTokens ?? 4000;

    return this.tracing.trace(
      `ai-${opts.feature}`,
      {
        userId: opts.patientId,
        tags: ['ai-assist', opts.feature],
        input: { feature: opts.feature },
        output: (r: AiResult<T>) => (r.status === 'COMPLETED' ? { status: r.status, ...(opts.summarise ? (opts.summarise(r.data) as object) : {}) } : { status: r.status }),
      },
      async (): Promise<AiResult<T>> => {
        try {
          const response = await this.tracing.generation(
            `ai-${opts.feature}`,
            {
              model,
              // Our instructions only: what the model was sent about a patient is never passed to a trace.
              input: [{ role: 'system', content: opts.system }],
              modelParameters: { max_tokens: maxTokens, ...(SUPPORTS_EFFORT.test(model) ? { effort: 'medium' } : {}) },
            },
            async (record) => {
              const res = await this.getClient().beta.messages.create(
                {
                  model,
                  max_tokens: maxTokens,
                  ...(SUPPORTS_FALLBACKS.test(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
                  output_config: { ...(SUPPORTS_EFFORT.test(model) ? { effort: 'medium' as const } : {}), format: { type: 'json_schema', schema: opts.schema } },
                  system: opts.system,
                  messages: [{ role: 'user', content: opts.user }],
                },
                { signal: AbortSignal.timeout(DEADLINE_MS) },
              );
              record({
                model: res.model,
                usage: res.usage,
                output: { stop_reason: res.stop_reason },
                warning: res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens' ? `Stopped: ${res.stop_reason}` : undefined,
              });
              return res;
            },
          );
          if (response.stop_reason === 'refusal') return { status: 'FAILED', reason: 'The AI declined this one' };
          if (response.stop_reason === 'max_tokens') return { status: 'FAILED', reason: 'The answer was cut off' };
          const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
          if (!text) return { status: 'FAILED', reason: 'The AI gave no answer' };
          return { status: 'COMPLETED', data: JSON.parse(text) as T, model };
        } catch (err) {
          this.logger.error(`AI ${opts.feature} failed: ${err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : (err as Error).message}`);
          return { status: 'FAILED', reason: 'The AI helper isn’t available right now' };
        }
      },
    );
  }
}
