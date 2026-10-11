import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { propagateAttributes, setLangfuseTracerProvider, startActiveObservation } from '@langfuse/tracing';
import { context } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export type TraceAttrs<T> = {
  /** Pseudonymous internal id only (never a name or email). */
  userId?: string;
  tags?: string[];
  /** Short string values: they are carried on every observation of the trace. */
  metadata?: Record<string, string>;
  /** What a reviewer needs at a glance. Never raw documents or photos. */
  input?: unknown;
  /** Summarises the result for the trace output; leave out anything that identifies the patient. */
  output?: (result: T) => unknown;
};

export type GenerationAttrs = {
  model: string;
  /** The text we sent. Images are described (type, size), never included. */
  input: unknown;
  modelParameters?: Record<string, string | number>;
  metadata?: Record<string, unknown>;
};

export type GenerationResult = {
  output?: unknown;
  /** The model that actually answered, which can differ from the one asked for when the API falls back. */
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
  /** For an answer that arrived but is not usable (a refusal, a cut-off). */
  warning?: string;
};

// Whatever the code passes in, a photo or document must never reach Langfuse: long base64 runs and data URIs
// are removed, and so are email addresses. This is the safety net; the calls below also never pass them in.
const BASE64_RUN = /(?:data:[\w/+.-]+;base64,)?[A-Za-z0-9+/=_-]{300,}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
export function maskTraceData({ data }: { data: unknown }): unknown {
  return typeof data === 'string' ? data.replace(BASE64_RUN, '[removed: binary data]').replace(EMAIL, '[removed: email]') : data;
}

/** An error is described by its kind and status, never by text that may echo the request. */
function describeFailure(err: unknown): string {
  const e = err as { name?: string; status?: number };
  return `${e?.name ?? 'Error'}${e?.status ? ` (HTTP ${e.status})` : ''}`;
}

/**
 * Traces the app's LLM calls in Langfuse (https://langfuse.com). Off unless LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY
 * are set (or with LANGFUSE_TRACING_ENABLED=false), and then every method just runs the work it is given.
 *
 * What the calls send to the model includes patients' photos and prescription or ID documents, which are health data,
 * so traces hold only the instructions, token counts, timings and a summary of the answer: see maskTraceData above.
 *
 *   LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL  the project's keys; use the EU region or self-host
 *   LANGFUSE_TRACING_ENVIRONMENT                                    defaults to NODE_ENV
 */
@Injectable()
export class LlmTracingService implements OnApplicationShutdown {
  private readonly logger = new Logger(LlmTracingService.name);
  private provider: NodeTracerProvider | null = null;
  private processor: LangfuseSpanProcessor | null = null;
  // Each Vercel invocation may be frozen once it responds, so spans are sent straight away rather than batched.
  private readonly serverless = !!process.env.VERCEL;

  constructor(config?: Pick<ConfigService, 'get'>) {
    const publicKey = config?.get<string>('LANGFUSE_PUBLIC_KEY')?.trim();
    const secretKey = config?.get<string>('LANGFUSE_SECRET_KEY')?.trim();
    if (!publicKey || !secretKey || config?.get<string>('LANGFUSE_TRACING_ENABLED')?.trim().toLowerCase() === 'false') return;

    this.processor = new LangfuseSpanProcessor({
      publicKey,
      secretKey,
      baseUrl: config?.get<string>('LANGFUSE_BASE_URL')?.trim() || 'https://cloud.langfuse.com',
      environment: config?.get<string>('LANGFUSE_TRACING_ENVIRONMENT')?.trim() || config?.get<string>('NODE_ENV') || 'development',
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      mask: maskTraceData,
      mediaUploadEnabled: false, // base64 media in a span is otherwise uploaded to Langfuse
      exportMode: this.serverless ? 'immediate' : 'batched',
    });
    // Only traces, to Langfuse: NodeSDK would also start default metric and log exporters. The provider is kept apart
    // from OpenTelemetry's global one, which another setup (the PostHog logger's NodeSDK) may already hold: with a
    // shared global, whichever registers second is silently ignored and no traces arrive.
    this.provider = new NodeTracerProvider({ spanProcessors: [this.processor] });
    setLangfuseTracerProvider(this.provider);
    // Nested observations need a context manager; nothing else may have installed one (this is a no-op if it did).
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    this.logger.log('LLM calls are traced in Langfuse (photos and documents are never sent)');
  }

  get enabled() {
    return !!this.provider;
  }

  /** One trace for one piece of work, such as reading one document. The generations made inside nest under it. */
  async trace<T>(name: string, attrs: TraceAttrs<T>, fn: () => Promise<T>): Promise<T> {
    if (!this.provider) return fn();
    try {
      return await startActiveObservation(name, (root) => {
        root.update({ input: attrs.input });
        return propagateAttributes({ traceName: name, userId: attrs.userId, tags: attrs.tags, metadata: attrs.metadata }, async () => {
          try {
            const result = await fn();
            root.update({ output: attrs.output ? attrs.output(result) : undefined });
            return result;
          } catch (err) {
            root.update({ level: 'ERROR', statusMessage: describeFailure(err) });
            throw err;
          }
        });
      });
    } finally {
      await this.flush();
    }
  }

  /** One model call. Records the model, tokens (which give the cost) and a summary of the answer. */
  generation<T>(name: string, attrs: GenerationAttrs, fn: (record: (r: GenerationResult) => void) => Promise<T>): Promise<T> {
    if (!this.provider) return fn(() => undefined);
    return startActiveObservation(
      name,
      async (gen) => {
        gen.update({ model: attrs.model, input: attrs.input, modelParameters: attrs.modelParameters, metadata: attrs.metadata });
        try {
          return await fn((r) => {
            const u = r.usage;
            gen.update({
              output: r.output,
              ...(r.model ? { model: r.model } : {}),
              ...(r.warning ? { level: 'WARNING' as const, statusMessage: r.warning } : {}),
              ...(u
                ? {
                    usageDetails: {
                      input: u.input_tokens ?? 0,
                      output: u.output_tokens ?? 0,
                      ...(u.cache_read_input_tokens ? { cache_read_input_tokens: u.cache_read_input_tokens } : {}),
                      ...(u.cache_creation_input_tokens ? { cache_creation_input_tokens: u.cache_creation_input_tokens } : {}),
                    },
                  }
                : {}),
            });
          });
        } catch (err) {
          gen.update({ level: 'ERROR', statusMessage: describeFailure(err) });
          throw err;
        }
      },
      { asType: 'generation' },
    );
  }

  private async flush() {
    if (!this.serverless) return;
    await this.processor?.forceFlush().catch((err) => this.logger.warn(`Could not send traces to Langfuse: ${(err as Error).message}`));
  }

  async onApplicationShutdown() {
    await this.provider?.shutdown().catch(() => undefined);
  }
}
