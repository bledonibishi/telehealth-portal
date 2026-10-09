import { Logger } from '@nestjs/common';
import { GraphQLFormattedError } from 'graphql';
import { unwrapResolverError } from '@apollo/server/errors';
import { ERRORS, ErrorCode } from '@telehealth/shared-types';
import { normalizeError } from './normalize-error';

const logger = new Logger('GraphQL');

// Apollo's own codes for a request that never reached a resolver: a query the schema rejects, or variables of the
// wrong type. Those are bugs in an app, and their text ("Int cannot represent…") is not for patients.
const REQUEST_ERROR_CODES = new Set(['GRAPHQL_PARSE_FAILED', 'GRAPHQL_VALIDATION_FAILED', 'BAD_USER_INPUT', 'OPERATION_RESOLUTION_FAILURE', 'PERSISTED_QUERY_NOT_FOUND', 'PERSISTED_QUERY_NOT_SUPPORTED']);

/**
 * Every GraphQL error leaves with `extensions: { code, severity, reason?, fields? }` from the shared catalog and a
 * message that is safe to show. Crashes are logged here (PostHog already has them from its exception filter) and
 * answered with the generic message, so no stack, SQL or internal name reaches a client.
 */
export function formatGraphQLError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const apolloCode = formatted.extensions?.code as string | undefined;
  if (apolloCode && REQUEST_ERROR_CODES.has(apolloCode)) {
    logger.warn(`${apolloCode}: ${formatted.message}`);
    return { message: ERRORS[ErrorCode.BAD_REQUEST].message, locations: formatted.locations, path: formatted.path, extensions: { code: ErrorCode.BAD_REQUEST, severity: 'error' } };
  }

  const normalized = normalizeError(unwrapResolverError(error));
  if (normalized.unexpected) logger.error(unwrapResolverError(error));

  const original = formatted.extensions?.originalError as Record<string, unknown> | undefined;
  return {
    message: normalized.message,
    locations: formatted.locations,
    path: formatted.path,
    extensions: {
      code: normalized.code,
      severity: normalized.severity,
      ...(normalized.reason && { reason: normalized.reason }),
      ...(normalized.fields && { fields: normalized.fields }),
      // App builds from before `reason` moved up read it from here; drop once those are gone.
      ...(normalized.reason && original && { originalError: { reason: normalized.reason } }),
      ...(process.env.NODE_ENV !== 'production' && formatted.extensions?.stacktrace ? { stacktrace: formatted.extensions.stacktrace } : {}),
    },
  };
}
