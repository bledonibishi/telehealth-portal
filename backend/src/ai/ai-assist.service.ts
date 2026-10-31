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
export type AiFeature = 'brief' | 'reply' | 'translate' | 'urgency' | 'search' | 'labs' | 'support';
export const AI_FEATURES: AiFeature[] = ['brief', 'reply', 'translate', 'urgency', 'search', 'labs', 'support'];

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Whether a helper has been switched on, and not vetoed. (Whether there is a key is checked separately.) */
export function featureSwitchedOn(config: { get: (key: string) => string | undefined }, feature: AiFeature): boolean {
  const on = list(config.get('AI_ENABLED_FEATURES'));
  // "all" covers the helpers that assist the team. The support assistant writes to patients on its own, so it is only ever
  // switched on by naming it.
  const named = on.includes(feature);
  const viaAll = on.includes('all') && feature !== 'support';
  return (named || viaAll) && !list(config.get('AI_DISABLED_FEATURES')).includes(feature);
}

// These tasks are summarising, drafting and translating short texts, with a person checking the result. The mid-tier model
// is enough. Override all with AI_ASSIST_MODEL, or one helper with AI_MODEL_<HELPER> (BRIEF, REPLY, TRANSLATE, URGENCY, SEARCH).
export const DEFAULT_AI_ASSIST_MODEL = 'claude-sonnet-5-5';
const DEADLINE_MS = 60_000;

/** Checks another model's work: see checkerModel(). */
export const DEFAULT_CHECKER_MODEL = 'claude-haiku-4-5';
/** Lookups the model may make before it must answer. */
const MAX_TOOL_ROUNDS = 3;
const NO_INPUT = { type: 'object', properties: {}, additionalProperties: false };

/** Something the model may look up. `run` is ours: it decides what data it returns, whatever the model asked for. */
export type AiTool = { name: string; description: string; inputSchema?: Record<string, unknown>; run: (input: unknown) => Promise<unknown> };
export type ToolOutput = { name: string; output: string };

export type AiResult<T> = { status: 'COMPLETED'; data: T; model: string; toolOutputs?: ToolOutput[] } | { status: 'DISABLED' | 'FAILED'; reason: string };

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
   * The small, cheap model used to check another model's work (the support assistant's draft answers): a yes/no judgement on
   * a short text needs no more. AI_MODEL_CHECKER overrides it.
   */
  checkerModel(): string {
    return this.config.get<string>('AI_MODEL_CHECKER')?.trim() || DEFAULT_CHECKER_MODEL;
  }

  /**
   * Asks for JSON matching `schema`. `system` is our instructions; `user` carries the record or message text and is never
   * traced. `summarise` says what a trace may show of the answer (counts and flags, never its words).
   *
   * `tools` lets the model look something up before it answers (the tool runs here, in our code, never on the model's
   * say-so about whose data it is). What a tool returned comes back in `toolOutputs`, so a caller can check the answer
   * against it. Neither the tool's input nor its output reaches a trace, only its name.
   */
  async json<T>(opts: {
    feature: AiFeature;
    system: string;
    user: string;
    schema: Record<string, unknown>;
    maxTokens?: number;
    patientId?: string;
    model?: string;
    tools?: AiTool[];
    summarise?: (data: T) => unknown;
  }): Promise<AiResult<T>> {
    if (!this.isEnabled(opts.feature)) return { status: 'DISABLED', reason: 'This AI helper isn’t switched on' };
    const model = opts.model || this.modelFor(opts.feature);
    const maxTokens = opts.maxTokens ?? 4000;
    const tools = opts.tools ?? [];
    const toolOutputs: ToolOutput[] = [];

    return this.tracing.trace(
      `ai-${opts.feature}`,
      {
        userId: opts.patientId,
        tags: ['ai-assist', opts.feature],
        input: { feature: opts.feature },
        output: (r: AiResult<T>) => (r.status === 'COMPLETED' ? { status: r.status, tools: r.toolOutputs?.map((o) => o.name) ?? [], ...(opts.summarise ? (opts.summarise(r.data) as object) : {}) } : { status: r.status }),
      },
      async (): Promise<AiResult<T>> => {
        try {
          const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: opts.user }];
          for (let round = 0; ; round++) {
            const response = await this.call(opts.feature, model, maxTokens, opts.system, opts.schema, messages, tools);
            if (response.stop_reason === 'refusal') return { status: 'FAILED', reason: 'The AI declined this one' };
            if (response.stop_reason === 'max_tokens') return { status: 'FAILED', reason: 'The answer was cut off' };
            if (response.stop_reason === 'tool_use') {
              // A model that keeps asking for lookups is stuck: better a person than a loop.
              if (round >= MAX_TOOL_ROUNDS) return { status: 'FAILED', reason: 'The AI kept looking things up without answering' };
              messages.push({ role: 'assistant', content: response.content });
              messages.push({ role: 'user', content: await this.runTools(response.content, tools, toolOutputs) });
              continue;
            }
            const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
            if (!text) return { status: 'FAILED', reason: 'The AI gave no answer' };
            return { status: 'COMPLETED', data: JSON.parse(text) as T, model, ...(toolOutputs.length ? { toolOutputs } : {}) };
          }
        } catch (err) {
          this.logger.error(`AI ${opts.feature} failed: ${err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : (err as Error).message}`);
          return { status: 'FAILED', reason: 'The AI helper isn’t available right now' };
        }
      },
    );
  }

  /** One request to the model, recorded as one generation (our instructions, the model, tokens; never the conversation). */
  private call(feature: AiFeature, model: string, maxTokens: number, system: string, schema: Record<string, unknown>, messages: Anthropic.Beta.BetaMessageParam[], tools: AiTool[]) {
    return this.tracing.generation(
      `ai-${feature}`,
      {
        model,
        // Our instructions only: what the model was sent about a patient is never passed to a trace.
        input: [{ role: 'system', content: system }],
        modelParameters: { max_tokens: maxTokens, ...(SUPPORTS_EFFORT.test(model) ? { effort: 'medium' } : {}) },
      },
      async (record) => {
        const res = await this.getClient().beta.messages.create(
          {
            model,
            max_tokens: maxTokens,
            ...(SUPPORTS_FALLBACKS.test(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
            output_config: { ...(SUPPORTS_EFFORT.test(model) ? { effort: 'medium' as const } : {}), format: { type: 'json_schema', schema } },
            ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: (t.inputSchema ?? NO_INPUT) as Anthropic.Beta.BetaTool.InputSchema, strict: true })) } : {}),
            system,
            messages,
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
  }

  /** Runs the lookups the model asked for and hands back every result in one message (a failed one says so, it is not dropped). */
  private async runTools(content: Anthropic.Beta.BetaContentBlock[], tools: AiTool[], outputs: ToolOutput[]): Promise<Anthropic.Beta.BetaToolResultBlockParam[]> {
    const calls = content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    return Promise.all(
      calls.map(async (call): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const tool = tools.find((t) => t.name === call.name);
        if (!tool) return { type: 'tool_result', tool_use_id: call.id, content: `There is no tool called ${call.name}.`, is_error: true };
        try {
          const output = JSON.stringify(await tool.run(call.input));
          outputs.push({ name: tool.name, output });
          return { type: 'tool_result', tool_use_id: call.id, content: output };
        } catch (err) {
          this.logger.error(`AI tool ${tool.name} failed: ${(err as Error).message}`);
          return { type: 'tool_result', tool_use_id: call.id, content: 'The lookup failed. Answer without it.', is_error: true };
        }
      }),
    );
  }
}
