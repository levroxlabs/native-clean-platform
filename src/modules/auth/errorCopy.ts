import type { UseFormSetError } from 'react-hook-form';

import { API_ERROR_CODES, ApiError } from '@/lib';

import type { Credentials } from './validations';

const FORM_FIELDS = {
  EMAIL: 'email',
  PASSWORD: 'password',
} as const;

type FormField = (typeof FORM_FIELDS)[keyof typeof FORM_FIELDS];

/**
 * `code` is the API's stable contract and doubles as the i18n key. `message` is
 * for logs and must never reach the screen, so every code the user can cause
 * gets copy here.
 */
const COPY_BY_CODE: Readonly<Record<string, string>> = {
  [API_ERROR_CODES.INVALID_CREDENTIALS]: 'Email or password is incorrect.',
  [API_ERROR_CODES.EMAIL_ALREADY_IN_USE]: 'This email is already registered.',
  [API_ERROR_CODES.VALIDATION_ERROR]: 'Please check the fields above.',
  [API_ERROR_CODES.NETWORK_ERROR]: 'Could not reach the server. Check your connection.',
  [API_ERROR_CODES.INTERNAL_SERVER_ERROR]: 'The server had a problem. Please try again.',
};

/** A code with no entry must never leave the screen silent. */
const FALLBACK_COPY = 'Something went wrong. Please try again.';

const SERVER_FIELD_MESSAGE = 'The server rejected this value.';

export const copyForError = (error: unknown): string => {
  if (!(error instanceof ApiError)) return FALLBACK_COPY;

  return COPY_BY_CODE[error.code] ?? FALLBACK_COPY;
};

const isFormField = (field: string | undefined): field is FormField =>
  field === FORM_FIELDS.EMAIL || field === FORM_FIELDS.PASSWORD;

/**
 * Puts the API's per-field `details[]` where react-hook-form already renders
 * local errors, so server validation and client validation land in the same
 * place on the screen.
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
