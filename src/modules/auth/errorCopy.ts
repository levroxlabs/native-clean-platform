import type { UseFormSetError } from 'react-hook-form';

import { ApiError } from '@/lib';

import type { Credentials } from './validations';

const FORM_FIELDS = {
  EMAIL: 'email',
  PASSWORD: 'password',
} as const;

type FormField = (typeof FORM_FIELDS)[keyof typeof FORM_FIELDS];

/**
 * This module's domain codes only. Everything a module can receive whatever it
 * asked for — network, 500, drifted contract — lives in `@/errors`, and
 * `App.tsx` registers this map there.
 */
export const AUTH_ERROR_COPY = {
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  EMAIL_ALREADY_IN_USE: 'This email is already registered.',
} as const;

const SERVER_FIELD_MESSAGE = 'The server rejected this value.';

const isFormField = (field: string | undefined): field is FormField =>
  field === FORM_FIELDS.EMAIL || field === FORM_FIELDS.PASSWORD;

/**
 * Puts the API's per-field `details[]` where react-hook-form already renders
 * local errors, so server validation and client validation land in the same
 * place on the screen. It stays in this module because only this module knows
 * its fields are `email` and `password`.
 */
export const applyServerFieldErrors = (
  error: unknown,
  setError: UseFormSetError<Credentials>,
): void => {
  if (!(error instanceof ApiError)) return;

  for (const detail of error.details) {
    if (isFormField(detail.field)) {
      setError(detail.field, { message: SERVER_FIELD_MESSAGE });
    }
  }
};
