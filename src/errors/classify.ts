import { API_ERROR_CODES, ApiError } from '@/lib';

export const ERROR_KINDS = {
  /** Never reached the API: offline, DNS, timeout. */
  OFFLINE: 'offline',
  /** The API answered, and it was its own fault. */
  SERVER: 'server',
  /** The API rejected what was sent, and the user can fix it. */
  INPUT: 'input',
  /** The stored token is no longer valid. */
  SESSION: 'session',
  /** A drifted contract, or something that is not an `ApiError` at all. */
  UNEXPECTED: 'unexpected',
} as const;

export type ErrorKind = (typeof ERROR_KINDS)[keyof typeof ERROR_KINDS];

const UNAUTHORIZED_STATUS = 401;
const LOWEST_CLIENT_ERROR_STATUS = 400;
const LOWEST_SERVER_ERROR_STATUS = 500;

/** Retries *after* the original call, so one: two network attempts in total. */
const MAX_RETRY_ATTEMPTS = 1;

export const classifyError = (error: unknown): ErrorKind => {
  if (!(error instanceof ApiError)) return ERROR_KINDS.UNEXPECTED;

  if (error.code === API_ERROR_CODES.NETWORK_ERROR) return ERROR_KINDS.OFFLINE;
  if (error.code === API_ERROR_CODES.UNEXPECTED_RESPONSE) return ERROR_KINDS.UNEXPECTED;

  // Session before the 4xx range, and by code rather than by status: a wrong
  // password is a 401 too, and it is input the user can correct, not a session
  // that ended.
  if (error.status === UNAUTHORIZED_STATUS && error.code === API_ERROR_CODES.INVALID_ACCESS_TOKEN) {
    return ERROR_KINDS.SESSION;
  }

  if (error.status >= LOWEST_SERVER_ERROR_STATUS) return ERROR_KINDS.SERVER;
  if (error.status >= LOWEST_CLIENT_ERROR_STATUS) return ERROR_KINDS.INPUT;

  return ERROR_KINDS.UNEXPECTED;
};

const RETRYABLE_KINDS: readonly ErrorKind[] = [ERROR_KINDS.OFFLINE, ERROR_KINDS.SERVER];

export const isRetryable = (error: unknown): boolean =>
  RETRYABLE_KINDS.includes(classifyError(error));

/** Shaped for TanStack Query's `retry` option. Queries only — see the plan. */
export const shouldRetry = (failureCount: number, error: unknown): boolean =>
  failureCount < MAX_RETRY_ATTEMPTS && isRetryable(error);
