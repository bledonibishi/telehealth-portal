import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CreateSessionRequest {
  /** Our own id for the person (the patient id). Not personal data. */
  externalRef: string;
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD */
  birthDate: string;
}

export interface CreatedSession {
  id: string;
  hostedUrl: string;
  expiresAt: string;
  status: string;
}

export interface RemoteSession {
  id: string;
  externalRef: string;
  status: string;
  expiresAt: string;
  review?: { decision?: string; reason?: string | null; decidedAt?: string } | null;
}

/** An error from verify-service. Carries the status and code only, never request or response bodies. */
export class VerifyServiceError extends Error {
  constructor(
    readonly httpStatus: number | null,
    readonly code?: string,
  ) {
    super(`verify-service request failed${httpStatus ? ` (${httpStatus}${code ? ` ${code}` : ''})` : ''}`);
  }

  get isMonthlyCapReached() {
    return this.httpStatus === 429 && this.code === 'monthly_cap_reached';
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Server-to-server calls to verify-service. The API key is read from configuration on every
 * call (so it can be rotated without a code change) and is only ever sent as a Bearer header.
 */
@Injectable()
export class VerifyClient {
  constructor(private config: ConfigService) {}

  private get baseUrl(): string {
    return (this.config.get<string>('VERIFY_BASE_URL') ?? '').replace(/\/+$/, '');
  }

  private get apiKey(): string {
    return this.config.get<string>('VERIFY_API_KEY') ?? '';
  }

  get isConfigured(): boolean {
    return !!this.baseUrl && !!this.apiKey;
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new VerifyServiceError(null);
    }

    if (!res.ok) {
      let code: string | undefined;
      try {
        code = ((await res.json()) as { code?: string }).code;
      } catch {
        // Not JSON; the status alone is enough.
      }
      throw new VerifyServiceError(res.status, code);
    }
    return (await res.json()) as T;
  }

  /** Not retried on failure: a repeat after an unclear failure would create a second session. */
  createSession(input: CreateSessionRequest): Promise<CreatedSession> {
    return this.request<CreatedSession>('POST', '/v1/sessions', input);
  }

  getSession(sessionId: string): Promise<RemoteSession> {
    return this.request<RemoteSession>('GET', `/v1/sessions/${encodeURIComponent(sessionId)}`);
  }
}
