/**
 * Every error the API can answer with, and how the apps should present it.
 *
 * The backend puts `code`, `severity` and `message` on every error it sends (GraphQL `extensions`, or the JSON body
 * of a REST route), and the apps turn whatever failed into the same shape with `describeError`. So a screen never
 * has to know about Apollo, HTTP statuses or network failures: it renders `describeError(error)`.
 *
 * To add an error: add a code here with its status, severity and a default message, then throw it on the backend
 * with `new AppError(ErrorCode.X)` (or `new AppError(ErrorCode.X, 'a more specific message')`). Add the default
 * message to the clinician dictionaries so it is translated.
 */
export enum ErrorCode {
  // Chosen from the HTTP status when the code that threw did not name one.
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL = 'INTERNAL',

  // Raised in the apps, never by the API.
  NETWORK = 'NETWORK',

  // Input that does not pass a check; `fields` says which inputs and why.
  VALIDATION_FAILED = 'VALIDATION_FAILED',

  // Sign-in and accounts.
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  WRONG_CURRENT_PASSWORD = 'WRONG_CURRENT_PASSWORD',
  INVALID_MFA_CODE = 'INVALID_MFA_CODE',
  ACCOUNT_NOT_ACTIVATED = 'ACCOUNT_NOT_ACTIVATED',
  ACCOUNT_DEACTIVATED = 'ACCOUNT_DEACTIVATED',
  ACCOUNT_ALREADY_ACTIVATED = 'ACCOUNT_ALREADY_ACTIVATED',
  LINK_INVALID_OR_EXPIRED = 'LINK_INVALID_OR_EXPIRED',
  /** The session cannot continue; `reason` (an AuthFailureReason) says why. Apps sign out, or refresh when expired. */
  SESSION_ENDED = 'SESSION_ENDED',
}

/**
 * `error`: something failed or the input is wrong.
 * `warning`: nothing is broken, but it cannot happen yet: wait, retry, or do something else first.
 */
export type ErrorSeverity = 'error' | 'warning';

export interface ErrorDefinition {
  status: number;
  severity: ErrorSeverity;
  /** English. Shown when the code that threw gave no message of its own, and always for INTERNAL and NETWORK. */
  message: string;
  /** Trying the same thing again a little later can work, so the apps offer a "Try again" button. */
  retryable: boolean;
}

export const ERRORS: Record<ErrorCode, ErrorDefinition> = {
  [ErrorCode.BAD_REQUEST]: { status: 400, severity: 'error', retryable: false, message: 'That didn’t work. Please check the details and try again.' },
  [ErrorCode.UNAUTHENTICATED]: { status: 401, severity: 'error', retryable: false, message: 'Please sign in to continue.' },
  [ErrorCode.FORBIDDEN]: { status: 403, severity: 'error', retryable: false, message: 'You don’t have access to this.' },
  [ErrorCode.NOT_FOUND]: { status: 404, severity: 'error', retryable: false, message: 'We couldn’t find that. It may have been moved or removed.' },
  [ErrorCode.CONFLICT]: { status: 409, severity: 'warning', retryable: false, message: 'This was changed a moment ago. Refresh and try again.' },
  [ErrorCode.PAYLOAD_TOO_LARGE]: { status: 413, severity: 'error', retryable: false, message: 'That file is too large.' },
  [ErrorCode.RATE_LIMITED]: { status: 429, severity: 'warning', retryable: true, message: 'Too many attempts. Please wait a few minutes and try again.' },
  [ErrorCode.SERVICE_UNAVAILABLE]: { status: 503, severity: 'warning', retryable: true, message: 'This is temporarily unavailable. Please try again in a moment.' },
  [ErrorCode.INTERNAL]: { status: 500, severity: 'error', retryable: true, message: 'Something went wrong on our side. Please try again.' },
  [ErrorCode.NETWORK]: { status: 0, severity: 'warning', retryable: true, message: 'We couldn’t reach the server. Check your connection and try again.' },
  [ErrorCode.VALIDATION_FAILED]: { status: 400, severity: 'error', retryable: false, message: 'Some of the details aren’t valid. Please check them and try again.' },
  [ErrorCode.INVALID_CREDENTIALS]: { status: 401, severity: 'error', retryable: false, message: 'That email and password don’t match.' },
  [ErrorCode.WRONG_CURRENT_PASSWORD]: { status: 400, severity: 'error', retryable: false, message: 'Your current password is not right.' },
  [ErrorCode.INVALID_MFA_CODE]: { status: 401, severity: 'error', retryable: false, message: 'That code isn’t right. Please check it and try again.' },
  [ErrorCode.ACCOUNT_NOT_ACTIVATED]: { status: 401, severity: 'warning', retryable: false, message: 'Your account isn’t activated yet. Check your email for the activation link.' },
  [ErrorCode.ACCOUNT_DEACTIVATED]: { status: 401, severity: 'error', retryable: false, message: 'This account has been deactivated.' },
  [ErrorCode.ACCOUNT_ALREADY_ACTIVATED]: { status: 409, severity: 'warning', retryable: false, message: 'A password is already set for this account. Sign in, or reset your password if you have forgotten it.' },
  [ErrorCode.LINK_INVALID_OR_EXPIRED]: { status: 401, severity: 'warning', retryable: false, message: 'This link is invalid or has expired. Request a new one.' },
  [ErrorCode.SESSION_ENDED]: { status: 401, severity: 'warning', retryable: false, message: 'Your session has ended. Please sign in again.' },
};

export // Codes whose own message is for the logs (a crash, or "Access token expired"): people get the catalog's.
const CATALOG_MESSAGE_ONLY = new Set<ErrorCode>([ErrorCode.INTERNAL, ErrorCode.NETWORK, ErrorCode.SESSION_ENDED]);

export const isErrorCode = (value: unknown): value is ErrorCode => typeof value === 'string' && value in ERRORS;

/** The code for an HTTP status, when nothing more specific is known. */
export function errorCodeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400: case 422: return ErrorCode.BAD_REQUEST;
    case 401: return ErrorCode.UNAUTHENTICATED;
    case 403: return ErrorCode.FORBIDDEN;
    case 404: return ErrorCode.NOT_FOUND;
    case 409: return ErrorCode.CONFLICT;
    case 413: return ErrorCode.PAYLOAD_TOO_LARGE;
    case 429: return ErrorCode.RATE_LIMITED;
    case 502: case 503: case 504: return ErrorCode.SERVICE_UNAVAILABLE;
    default: return status >= 400 && status < 500 ? ErrorCode.BAD_REQUEST : ErrorCode.INTERNAL;
  }
}

/** What the API sends for an error: GraphQL `extensions`, or the JSON body of a REST route (plus `statusCode`). */
export interface ApiErrorPayload {
  code: ErrorCode;
  severity: ErrorSeverity;
  message: string;
  /** Why a session ended (AuthFailureReason), for SESSION_ENDED. */
  reason?: string;
  /** Per-input messages, keyed by the input's name. */
  fields?: Record<string, string>;
}

/** An error, ready to show. `message` is English: translate it with the app's `t()` where there is one. */
export interface DescribedError extends ApiErrorPayload {
  retryable: boolean;
}

/**
 * Thrown by the apps' own fetch helpers (uploads, downloads) so a failed REST call carries the same code and
 * severity as a failed GraphQL one.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;
  readonly status: number;
  readonly reason?: string;
  readonly fields?: Record<string, string>;

  constructor(payload: ApiErrorPayload & { status?: number }) {
    super(payload.message);
    this.name = 'ApiError';
    this.code = payload.code;
    this.severity = payload.severity;
    this.status = payload.status ?? ERRORS[payload.code].status;
    this.reason = payload.reason;
    this.fields = payload.fields;
  }

  /** An error for a code from the catalog, e.g. to raise one in an app or show one in a story. */
  static of(code: ErrorCode, message?: string): ApiError {
    const { severity, message: fallback } = ERRORS[code];
    return new ApiError({ code, severity, message: message ?? fallback });
  }

  /** From a failed REST response's status and body text. Falls back to `fallback` when the body says nothing useful. */
  static fromResponse(status: number, body: string, fallback?: string): ApiError {
    let parsed: Partial<ApiErrorPayload> & { statusCode?: number } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      /* not JSON: a proxy page or plain text, which is not for patients to read */
    }
    const code = isErrorCode(parsed.code) ? parsed.code : errorCodeForStatus(status);
    const definition = ERRORS[code];
    const message = typeof parsed.message === 'string' && parsed.message && !CATALOG_MESSAGE_ONLY.has(code)
      ? parsed.message
      : fallback ?? definition.message;
    return new ApiError({ code, severity: parsed.severity ?? definition.severity, message, reason: parsed.reason, fields: parsed.fields, status });
  }
}

// The messages browsers and React Native give a fetch that never reached the server.
const NETWORK_MESSAGES = /failed to fetch|network request failed|networkerror|load failed|network error|the internet connection appears to be offline|timed? ?out/i;

interface GraphQLErrorLike {
  message?: string;
  extensions?: Record<string, unknown>;
}

interface ApolloErrorLike {
  message?: string;
  graphQLErrors?: readonly GraphQLErrorLike[];
  networkError?: (Error & { statusCode?: number; result?: unknown }) | null;
}

const fromDefinition = (code: ErrorCode, overrides: Partial<DescribedError> = {}): DescribedError => {
  const { severity, message, retryable } = ERRORS[code];
  return { code, severity, message, retryable, ...overrides };
};

function fromGraphQLError(error: GraphQLErrorLike): DescribedError {
  const ext = error.extensions ?? {};
  const legacyReason = (ext.originalError as { reason?: string } | undefined)?.reason;
  const reason = (ext.reason as string | undefined) ?? legacyReason;
  // An API from before the catalog sends a session reason with code UNAUTHENTICATED; the reason is what matters.
  const code = reason && (!isErrorCode(ext.code) || ext.code === ErrorCode.UNAUTHENTICATED)
    ? ErrorCode.SESSION_ENDED
    : isErrorCode(ext.code)
      ? ext.code
      : typeof ext.status === 'number'
        ? errorCodeForStatus(ext.status)
        : ErrorCode.INTERNAL;
  const definition = ERRORS[code];
  return {
    code,
    severity: ext.severity === 'warning' || ext.severity === 'error' ? ext.severity : definition.severity,
    message: CATALOG_MESSAGE_ONLY.has(code) || !error.message ? definition.message : error.message,
    retryable: definition.retryable,
    ...(reason && { reason }),
    ...(ext.fields && typeof ext.fields === 'object' ? { fields: ext.fields as Record<string, string> } : {}),
  };
}

/**
 * Turns anything a failed request or action can produce (an Apollo error, an ApiError, a fetch failure, a message
 * string) into one shape with a message that is safe to show. Unexpected errors get a generic message: their
 * own text ("Cannot read properties of undefined", a stack, SQL) is for the logs, not for people.
 */
export function describeError(error: unknown): DescribedError | null {
  if (error === null || error === undefined || error === '' || error === false) return null;
  if (typeof error === 'string') return fromDefinition(ErrorCode.BAD_REQUEST, { message: error });

  if (error instanceof ApiError || (typeof error === 'object' && (error as ApiError).name === 'ApiError')) {
    const e = error as ApiError;
    return { code: e.code, severity: e.severity, message: e.message, retryable: ERRORS[e.code]?.retryable ?? false, reason: e.reason, fields: e.fields };
  }

  if (typeof error === 'object') {
    const apollo = error as ApolloErrorLike;
    if (apollo.graphQLErrors?.length) return fromGraphQLError(apollo.graphQLErrors[0]);

    if (apollo.networkError) {
      // A non-2xx answer can still carry GraphQL errors (a query the schema rejects, a 401 from a proxy).
      const result = apollo.networkError.result as { errors?: GraphQLErrorLike[] } | undefined;
      if (result?.errors?.length) return fromGraphQLError(result.errors[0]);
      const status = apollo.networkError.statusCode;
      return fromDefinition(status ? errorCodeForStatus(status) : ErrorCode.NETWORK);
    }

    // An Apollo error with neither: a client-side failure (a bad cache read), which is our bug.
    if (Array.isArray(apollo.graphQLErrors)) return fromDefinition(ErrorCode.INTERNAL);

    // A plain GraphQL error handed over on its own.
    if ('extensions' in apollo) return fromGraphQLError(apollo as GraphQLErrorLike);
  }

  if (error instanceof Error) {
    if (NETWORK_MESSAGES.test(error.message)) return fromDefinition(ErrorCode.NETWORK);
    // A TypeError or ReferenceError is a bug in our code, and its message means nothing to the person using it.
    if (error instanceof TypeError || error instanceof ReferenceError || error instanceof SyntaxError || !error.message) {
      return fromDefinition(ErrorCode.INTERNAL);
    }
    return fromDefinition(ErrorCode.BAD_REQUEST, { message: error.message });
  }

  return fromDefinition(ErrorCode.INTERNAL);
}

/** Just the message, for places that can only show text (a native alert, a toast). */
export const errorMessage = (error: unknown): string => describeError(error)?.message ?? '';

/**
 * Why the session ended, if one of these GraphQL errors says it did. Only then should an app sign out (or refresh an
 * expired token): any other "unauthenticated", such as a wrong password, is a message for the form.
 */
export function sessionEndReason(errors: readonly GraphQLErrorLike[] | undefined): string | undefined {
  return errors?.map((e) => fromGraphQLError(e)).find((e) => e.code === ErrorCode.SESSION_ENDED && e.reason)?.reason;
}
