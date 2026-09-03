import { API_ERROR_CODES, ApiError } from '@/lib';

import { AUTH_STATUSES } from '../types';
import { isEndedSession, resolveStatus } from './session';

describe('resolveStatus', () => {
  it('stays loading until boot completes, regardless of token or user', () => {
    expect(resolveStatus({ hasCompletedBoot: false, token: null, user: null })).toBe(
      AUTH_STATUSES.LOADING,
    );
    expect(resolveStatus({ hasCompletedBoot: false, token: 'a-token', user: null })).toBe(
      AUTH_STATUSES.LOADING,
    );
  });

  it('is signed out once boot completes with no token', () => {
    expect(resolveStatus({ hasCompletedBoot: true, token: null, user: null })).toBe(
      AUTH_STATUSES.SIGNED_OUT,
    );
  });

  it('is signed out with a token but no verified user', () => {
    // A token alone is not a session: only /auth/me answering can promote it.
    expect(resolveStatus({ hasCompletedBoot: true, token: 'a-token', user: null })).toBe(
      AUTH_STATUSES.SIGNED_OUT,
    );
  });

  it('is signed in once boot completes with both a token and a user', () => {
    const user = {
      id: '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21',
      email: 'user@example.com',
      emailVerifiedAt: null,
      createdAt: '2026-09-01T12:00:00.000Z',
    };

    expect(resolveStatus({ hasCompletedBoot: true, token: 'a-token', user })).toBe(
      AUTH_STATUSES.SIGNED_IN,
    );
  });
});

describe('isEndedSession', () => {
  it.each([
    API_ERROR_CODES.INVALID_ACCESS_TOKEN,
    API_ERROR_CODES.INVALID_REFRESH_TOKEN,
    API_ERROR_CODES.REFRESH_TOKEN_REUSED,
  ])('is true for %s, which all mean the session is over', (code) => {
    expect(isEndedSession(new ApiError({ status: 401, code, message: 'not contract' }))).toBe(true);
  });

  it('is false for a wrong password, which is a 401 the user can correct', () => {
    expect(
      isEndedSession(
        new ApiError({
          status: 401,
          code: API_ERROR_CODES.INVALID_CREDENTIALS,
          message: 'Invalid credentials',
        }),
      ),
    ).toBe(false);
  });

  it('is false when the request never reached the API', () => {
    // Being offline is not a reason to make the user type their password again.
    expect(
      isEndedSession(
        new ApiError({
          status: 0,
          code: API_ERROR_CODES.NETWORK_ERROR,
          message: 'The request did not reach the API.',
        }),
      ),
    ).toBe(false);
  });

  it('is false for anything that is not an ApiError', () => {
    expect(isEndedSession(new TypeError('boom'))).toBe(false);
    expect(isEndedSession(null)).toBe(false);
  });
});
