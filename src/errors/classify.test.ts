import { API_ERROR_CODES, ApiError } from '@/lib';

import { classifyError, ERROR_KINDS, isRetryable, shouldRetry } from './classify';

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, message: 'not contract' });

describe('classifyError', () => {
  it('calls a request that never reached the API offline', () => {
    expect(classifyError(apiError(0, API_ERROR_CODES.NETWORK_ERROR))).toBe(ERROR_KINDS.OFFLINE);
  });

  it('calls a 500 a server error', () => {
    expect(classifyError(apiError(500, API_ERROR_CODES.INTERNAL_SERVER_ERROR))).toBe(
      ERROR_KINDS.SERVER,
    );
  });

  it('calls a rejected access token a session error', () => {
    expect(classifyError(apiError(401, API_ERROR_CODES.INVALID_ACCESS_TOKEN))).toBe(
      ERROR_KINDS.SESSION,
    );
  });

  it('calls a wrong password input, not a session error, though it is also a 401', () => {
    // The whole reason session is tested before the 4xx range: answering a
    // wrong password with generic copy would be the most common error in the
    // app getting the least useful message.
    expect(classifyError(apiError(401, API_ERROR_CODES.INVALID_CREDENTIALS))).toBe(
      ERROR_KINDS.INPUT,
    );
  });

  it('calls a validation failure input', () => {
    expect(classifyError(apiError(400, API_ERROR_CODES.VALIDATION_ERROR))).toBe(ERROR_KINDS.INPUT);
  });

  it('calls a rejected current password input', () => {
    expect(classifyError(apiError(422, API_ERROR_CODES.INVALID_CURRENT_PASSWORD))).toBe(
      ERROR_KINDS.INPUT,
    );
  });

  it('calls a rate limit input, so nothing retries it automatically', () => {
    // Retrying a 429 is what produced it. `INPUT` is the only kind that is
    // neither retried nor treated as a dead session, which is exactly right.
    expect(classifyError(apiError(429, API_ERROR_CODES.TOO_MANY_REQUESTS))).toBe(ERROR_KINDS.INPUT);
  });

  it('calls a rejected refresh token a session error', () => {
    expect(classifyError(apiError(401, API_ERROR_CODES.INVALID_REFRESH_TOKEN))).toBe(
      ERROR_KINDS.SESSION,
    );
  });

  it('calls a reused refresh token a session error', () => {
    // The API has already revoked the whole family by the time this arrives:
    // there is nothing to correct and nothing to retry.
    expect(classifyError(apiError(401, API_ERROR_CODES.REFRESH_TOKEN_REUSED))).toBe(
      ERROR_KINDS.SESSION,
    );
  });

  it('calls a transaction conflict a server error, since it arrives as a 503', () => {
    expect(classifyError(apiError(503, API_ERROR_CODES.TRANSACTION_CONFLICT))).toBe(
      ERROR_KINDS.SERVER,
    );
  });

  it('calls a drifted contract unexpected', () => {
    expect(classifyError(apiError(200, API_ERROR_CODES.UNEXPECTED_RESPONSE))).toBe(
      ERROR_KINDS.UNEXPECTED,
    );
  });

  it('calls a 5xx with a non-envelope body server, not unexpected, so a proxy error still retries', () => {
    // A gateway returning an HTML error page on a 502/503 fails the envelope
    // check in src/lib/api.ts and comes back as UNEXPECTED_RESPONSE — but the
    // status still says "server problem", and that must win: this is exactly
    // the transient failure the retry policy exists for.
    expect(classifyError(apiError(502, API_ERROR_CODES.UNEXPECTED_RESPONSE))).toBe(
      ERROR_KINDS.SERVER,
    );
    expect(classifyError(apiError(503, API_ERROR_CODES.UNEXPECTED_RESPONSE))).toBe(
      ERROR_KINDS.SERVER,
    );
  });

  it('calls anything that is not an ApiError unexpected', () => {
    expect(classifyError(new TypeError('undefined is not a function'))).toBe(
      ERROR_KINDS.UNEXPECTED,
    );
    expect(classifyError('a thrown string')).toBe(ERROR_KINDS.UNEXPECTED);
  });
});

describe('isRetryable', () => {
  it('retries what a second attempt could fix', () => {
    expect(isRetryable(apiError(0, API_ERROR_CODES.NETWORK_ERROR))).toBe(true);
    expect(isRetryable(apiError(503, API_ERROR_CODES.INTERNAL_SERVER_ERROR))).toBe(true);
  });

  it('retries a transaction conflict, which is transient by construction', () => {
    expect(isRetryable(apiError(503, API_ERROR_CODES.TRANSACTION_CONFLICT))).toBe(true);
  });

  it('does not retry what a second attempt cannot fix', () => {
    expect(isRetryable(apiError(401, API_ERROR_CODES.INVALID_CREDENTIALS))).toBe(false);
    expect(isRetryable(apiError(401, API_ERROR_CODES.INVALID_ACCESS_TOKEN))).toBe(false);
    expect(isRetryable(apiError(200, API_ERROR_CODES.UNEXPECTED_RESPONSE))).toBe(false);
  });
});

describe('shouldRetry', () => {
  const retryable = apiError(0, API_ERROR_CODES.NETWORK_ERROR);

  it('allows one more attempt after the first failure', () => {
    expect(shouldRetry(0, retryable)).toBe(true);
    expect(shouldRetry(1, retryable)).toBe(false);
  });

  it('never retries a terminal error, however few attempts happened', () => {
    expect(shouldRetry(0, apiError(400, API_ERROR_CODES.VALIDATION_ERROR))).toBe(false);
  });
});
