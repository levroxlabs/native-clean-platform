import { API_ERROR_CODES, ApiError } from '@/lib';

type ErrorCopyMap = Readonly<Record<string, string>>;

/**
 * The codes any module can receive, whatever it was asking for. A module's own
 * domain codes are registered by the composition root — see `registerErrorCopy`.
 */
const BASE_COPY: ErrorCopyMap = {
  [API_ERROR_CODES.NETWORK_ERROR]: 'Could not reach the server. Check your connection.',
  [API_ERROR_CODES.INTERNAL_SERVER_ERROR]: 'The server had a problem. Please try again.',
  [API_ERROR_CODES.VALIDATION_ERROR]: 'Please check the fields above.',
  [API_ERROR_CODES.UNEXPECTED_RESPONSE]: 'Something went wrong. Please try again.',
  [API_ERROR_CODES.BAD_REQUEST]: 'That request could not be processed.',
  [API_ERROR_CODES.ROUTE_NOT_FOUND]: 'That resource no longer exists.',
  [API_ERROR_CODES.TOO_MANY_REQUESTS]: 'Too many attempts. Please wait a moment and try again.',
  [API_ERROR_CODES.TRANSACTION_CONFLICT]: 'The server is busy. Please try again.',
};

/** A code with no entry must never leave the screen silent. */
const FALLBACK_COPY = 'Something went wrong. Please try again.';

let registeredCopy: ErrorCopyMap = {};

/**
 * Called by `App.tsx`, once per module. Registering as an import-time side
 * effect inside the module instead would depend on import order and on the
 * file actually being imported — a failure that is silent and hard to test.
 */
export const registerErrorCopy = (entries: ErrorCopyMap): void => {
  registeredCopy = { ...registeredCopy, ...entries };
};

/** For tests, so a registration in one file cannot leak into another. */
export const resetErrorCopy = (): void => {
  registeredCopy = {};
};

/**
 * `code` is the API's stable contract and doubles as the i18n key. `message` is
 * for logs and never reaches the screen.
 */
export const copyForError = (error: unknown): string => {
  if (!(error instanceof ApiError)) return FALLBACK_COPY;

  return registeredCopy[error.code] ?? BASE_COPY[error.code] ?? FALLBACK_COPY;
};
