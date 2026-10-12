import { ApiError, ErrorCode, describeError, sessionEndReason } from '@telehealth/shared-types';

// describeError runs in the apps; it lives in the shared package, which has no test runner, so it is tested here
// against what this API sends.
describe('describeError (shared, used by the apps)', () => {
  it('reads code, severity and message from a GraphQL error', () => {
    const apollo = { graphQLErrors: [{ message: 'This order has already shipped', extensions: { code: 'CONFLICT', severity: 'warning' } }], networkError: null };
    expect(describeError(apollo)).toMatchObject({ code: ErrorCode.CONFLICT, severity: 'warning', message: 'This order has already shipped' });
  });

  it('finds an ended session in the current shape and in an older API’s', () => {
    expect(sessionEndReason([{ message: 'x', extensions: { code: 'SESSION_ENDED', reason: 'TOKEN_EXPIRED' } }])).toBe('TOKEN_EXPIRED');
    expect(sessionEndReason([{ message: 'x', extensions: { code: 'UNAUTHENTICATED', originalError: { reason: 'TOKEN_EXPIRED' } } }])).toBe('TOKEN_EXPIRED');
    expect(sessionEndReason([{ message: 'Invalid credentials', extensions: { code: 'INVALID_CREDENTIALS' } }])).toBeUndefined();
  });

  it('turns a failed REST body into its message, never the raw JSON', () => {
    const body = JSON.stringify({ statusCode: 400, code: 'BAD_REQUEST', severity: 'error', message: 'Please upload a photo (JPEG, PNG, WebP or HEIC)' });
    expect(describeError(ApiError.fromResponse(400, body))?.message).toBe('Please upload a photo (JPEG, PNG, WebP or HEIC)');
    expect(describeError(ApiError.fromResponse(502, '<html>Bad gateway</html>', 'We couldn’t upload that file.'))).toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE, message: 'We couldn’t upload that file.' });
  });

  it('says offline for a fetch that never arrived, and hides a bug’s text', () => {
    expect(describeError(new TypeError('Network request failed'))?.code).toBe(ErrorCode.NETWORK);
    expect(describeError({ graphQLErrors: [], networkError: new TypeError('Failed to fetch') })?.code).toBe(ErrorCode.NETWORK);
    expect(describeError(new TypeError('Cannot read properties of undefined'))).toMatchObject({ code: ErrorCode.INTERNAL, message: 'Something went wrong on our side. Please try again.' });
  });

  it('returns nothing when there is no error', () => {
    expect(describeError(null)).toBeNull();
    expect(describeError('')).toBeNull();
  });
});
