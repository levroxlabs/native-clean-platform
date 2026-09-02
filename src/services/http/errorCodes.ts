/**
 * The API's stable error codes, copied from `api-clean-platform`. `code` is
 * contract on both sides; `message` is not, and is never rendered raw.
 *
 * The client's own two codes are marked. A code arriving from the API that is
 * absent here is not an error — `ApiError.code` is a plain string precisely so
 * a new server code degrades to the fallback copy instead of crashing.
 */
export const API_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  INVALID_ACCESS_TOKEN: 'INVALID_ACCESS_TOKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_IN_USE: 'EMAIL_ALREADY_IN_USE',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_EMAIL: 'INVALID_EMAIL',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  /** Client-side: the request never reached the API. */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** Client-side: the API answered something that is not the agreed shape. */
  UNEXPECTED_RESPONSE: 'UNEXPECTED_RESPONSE',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
