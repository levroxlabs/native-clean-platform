import { API_ERROR_CODES, ApiError } from '@/lib';

import { copyForError, registerErrorCopy, resetErrorCopy } from './copy';

const FALLBACK = 'Something went wrong. Please try again.';

const apiError = (code: string) => new ApiError({ status: 400, code, message: 'never rendered' });

beforeEach(() => {
  resetErrorCopy();
});

describe('copyForError', () => {
  it('answers from the base map for a code any module can receive', () => {
    expect(copyForError(apiError(API_ERROR_CODES.NETWORK_ERROR))).toBe(
      'Could not reach the server. Check your connection.',
    );
  });

  it('falls back for a code nobody registered', () => {
    expect(copyForError(apiError('A_CODE_SHIPPED_LATER'))).toBe(FALLBACK);
  });

  it('falls back for something that is not an ApiError', () => {
    expect(copyForError(new TypeError('boom'))).toBe(FALLBACK);
  });

  it('never renders the API message', () => {
    expect(copyForError(new ApiError({ status: 500, code: 'X', message: 'stack trace' }))).not.toBe(
      'stack trace',
    );
  });

  it('answers from a module map once it is registered', () => {
    registerErrorCopy({ INVALID_CREDENTIALS: 'Email or password is incorrect.' });

    expect(copyForError(apiError('INVALID_CREDENTIALS'))).toBe('Email or password is incorrect.');
  });

  it('lets a module override a base entry for its own domain', () => {
    registerErrorCopy({ [API_ERROR_CODES.VALIDATION_ERROR]: 'Check the highlighted fields.' });

    expect(copyForError(apiError(API_ERROR_CODES.VALIDATION_ERROR))).toBe(
      'Check the highlighted fields.',
    );
  });

  it('keeps registrations from separate modules side by side', () => {
    registerErrorCopy({ FIRST: 'from module one' });
    registerErrorCopy({ SECOND: 'from module two' });

    expect(copyForError(apiError('FIRST'))).toBe('from module one');
    expect(copyForError(apiError('SECOND'))).toBe('from module two');
  });
});
