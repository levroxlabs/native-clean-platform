import type { UseFormSetError } from 'react-hook-form';

import { API_ERROR_CODES, ApiError } from '@/lib';

import { AUTH_ERROR_COPY, applyServerFieldErrors } from './errorCopy';

interface Values {
  email: string;
  code: string;
}

const FIELDS = ['email', 'code'] as const;

const validationError = (field: string) =>
  new ApiError({
    status: 400,
    code: API_ERROR_CODES.VALIDATION_ERROR,
    message: 'never rendered',
    details: [{ field, code: 'invalid_format' }],
  });

describe('applyServerFieldErrors', () => {
  it('puts a server field error on the matching form field', () => {
    const setError = jest.fn() as unknown as UseFormSetError<Values>;

    applyServerFieldErrors<Values>(validationError('email'), setError, FIELDS);

    expect(setError).toHaveBeenCalledWith('email', { message: 'The server rejected this value.' });
  });

  it('ignores a field this form does not render', () => {
    // Otherwise the form refuses to submit and shows nothing to fix.
    const setError = jest.fn() as unknown as UseFormSetError<Values>;

    applyServerFieldErrors<Values>(validationError('password'), setError, FIELDS);

    expect(setError).not.toHaveBeenCalled();
  });

  it('ignores an error that is not an ApiError', () => {
    const setError = jest.fn() as unknown as UseFormSetError<Values>;

    applyServerFieldErrors<Values>(new Error('boom'), setError, FIELDS);

    expect(setError).not.toHaveBeenCalled();
  });
});

describe('AUTH_ERROR_COPY', () => {
  it('gives every failure mode of the verification code the same words', () => {
    // The API answers one code for unknown, wrong, expired and exhausted. Copy
    // that guessed between them would be inventing an oracle the API refused.
    expect(AUTH_ERROR_COPY[API_ERROR_CODES.EMAIL_VERIFICATION_FAILED]).toBe(
      'That code is not valid. Request a new one and try again.',
    );
  });

  it('says nothing about which reset-token failure happened', () => {
    expect(AUTH_ERROR_COPY[API_ERROR_CODES.PASSWORD_RESET_FAILED]).toBe(
      'That token is not valid. Start the recovery again to get a new one.',
    );
  });

  it('carries no entry for a code the API can no longer send', () => {
    expect(Object.keys(AUTH_ERROR_COPY)).not.toContain('EMAIL_ALREADY_IN_USE');
  });
});
