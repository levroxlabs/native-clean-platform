import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { API_ERROR_CODES, ApiError } from '@/lib';

/**
 * This module's domain codes only. Everything a module can receive whatever it
 * asked for — network, 500, 429, a drifted contract — lives in `@/errors`, and
 * `App.tsx` registers this map there.
 */
export const AUTH_ERROR_COPY = {
  [API_ERROR_CODES.INVALID_CREDENTIALS]: 'Email or password is incorrect.',
  [API_ERROR_CODES.INVALID_REFRESH_TOKEN]: 'Your session has expired. Please sign in again.',
  [API_ERROR_CODES.REFRESH_TOKEN_REUSED]:
    'Your session was ended for security. Please sign in again.',
  /**
   * One message for unknown, wrong, expired and attempts-exhausted, because the
   * API answers one code for all four. Wording that guessed between them would
   * hand back the oracle the API deliberately withheld.
   */
  [API_ERROR_CODES.EMAIL_VERIFICATION_FAILED]:
    'That code is not valid. Request a new one and try again.',
  /** Same reasoning: one code for unknown, wrong, expired and already used. */
  [API_ERROR_CODES.PASSWORD_RESET_FAILED]:
    'That token is not valid. Start the recovery again to get a new one.',
  /**
   * The account exists but is unverified. There is no route out of here in the
   * app: the pending registration was consumed when the account was created, so
   * `resend` would find nothing and `confirm` could never succeed. Copy only.
   */
  [API_ERROR_CODES.EMAIL_NOT_VERIFIED]:
    'Confirm your email address before signing in. Check your inbox.',
  [API_ERROR_CODES.INVALID_CURRENT_PASSWORD]: 'That is not your current password.',
  [API_ERROR_CODES.PASSWORD_UNCHANGED]: 'Choose a password different from your current one.',
  [API_ERROR_CODES.USER_NOT_FOUND]: 'That account no longer exists.',
  [API_ERROR_CODES.INVALID_EMAIL]: 'That email address is not valid.',
  [API_ERROR_CODES.INVALID_PASSWORD]: 'That password does not meet the requirements.',
} as const;

const SERVER_FIELD_MESSAGE = 'The server rejected this value.';

/**
 * Puts the API's per-field `details[]` where react-hook-form already renders
 * local errors, so server validation and client validation land in the same
 * place on the screen.
 *
 * `fields` is an allowlist, not a convenience: `details[].field` is a
 * server-side name, and setting an error on a field the form does not render
 * gives the user a form that refuses to submit with nothing visible to fix.
 * Typing it as `Path<TValues>` is what checks each list against its own schema.
 */
export const applyServerFieldErrors = <TValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TValues>,
  fields: readonly Path<TValues>[],
): void => {
  if (!(error instanceof ApiError)) return;

  for (const detail of error.details) {
    const field = fields.find((candidate) => candidate === detail.field);

    if (field !== undefined) setError(field, { message: SERVER_FIELD_MESSAGE });
  }
};
