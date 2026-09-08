import type { z } from 'zod';

import { API_ERROR_CODES, ApiError, api, CLIENT_FAILURE_STATUS } from '@/lib';

import type { Credentials } from '../validations';
import { type SessionTokens, sessionTokensSchema, type User, userSchema } from './schemas';

const CONTRACT_DRIFT_MESSAGE = 'The API response did not match the expected shape:';

/** Body transport, stated rather than inherited from the server default. */
const REFRESH_TRANSPORT_BODY = 'body';

/**
 * Parsing responses — not just requests — is what turns a silent contract drift
 * between the two repositories into a loud, located failure. It is re-thrown as
 * an `ApiError` so callers still handle exactly one error type.
 */
const parseOrThrow = <TSchema extends z.ZodType>(
  schema: TSchema,
  payload: unknown,
): z.infer<TSchema> => {
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw new ApiError({
      status: CLIENT_FAILURE_STATUS,
      code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
      message: `${CONTRACT_DRIFT_MESSAGE} ${parsed.error.message}`,
    });
  }

  return parsed.data;
};

export const login = async (credentials: Credentials): Promise<SessionTokens> => {
  const payload = await api.post('/auth/login', {
    ...credentials,
    refreshTransport: REFRESH_TRANSPORT_BODY,
  });

  return parseOrThrow(sessionTokensSchema, payload);
};

/** The only way the API offers to tell whether a stored token still verifies. */
export const fetchMe = async (): Promise<User> => {
  const payload = await api.get('/auth/me');

  return parseOrThrow(userSchema, payload);
};

/**
 * Spends the stored refresh token for a new pair. The presented token is dead
 * once this resolves, so the caller must persist the returned one before doing
 * anything else with it.
 */
export const refreshSession = async (refreshToken: string): Promise<SessionTokens> => {
  const payload = await api.post('/auth/refresh', { refreshToken });

  return parseOrThrow(sessionTokensSchema, payload);
};

/**
 * Ends this device's session, leaving other devices signed in. Answers 204, so
 * there is nothing to parse. Idempotent for any token presented — known or not.
 */
export const logout = async (refreshToken: string): Promise<void> => {
  await api.post('/auth/logout', { refreshToken });
};

/**
 * Ends every session of the account. No body: the API takes the user from the
 * verified bearer token, never from client input.
 */
export const logoutEverywhere = async (): Promise<void> => {
  await api.post('/auth/logout-all');
};

interface ConfirmSignUpInput {
  email: string;
  code: string;
  password: string;
}

interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * Step 1 of sign-up. Creates NO account — it records a pending registration and
 * emails a six-digit code.
 *
 * Answers 202 for a free address, for one already registering, and for one that
 * already has an account: the status cannot distinguish them, by design. What
 * differs is the email the address receives. Nothing to parse, and nothing a
 * caller may branch on.
 */
export const startSignUp = async (email: string): Promise<void> => {
  await api.post('/auth/register', { email });
};

/** Re-mints the code for a pending registration. 202 always; 60-second cooldown. */
export const resendVerificationCode = async (email: string): Promise<void> => {
  await api.post('/auth/email/verify/resend', { email });
};

/**
 * Step 2 of sign-up, and the step that CREATES the account — verified, with the
 * password sent in this request — and opens a session.
 *
 * The password belongs here and not in `startSignUp` because the code reaches
 * only the owner of the address: whoever confirms is whoever chooses the
 * password, which is what closes account pre-hijacking.
 */
export const confirmSignUp = async (input: ConfirmSignUpInput): Promise<SessionTokens> => {
  const payload = await api.post('/auth/email/verify', {
    ...input,
    refreshTransport: REFRESH_TRANSPORT_BODY,
  });

  return parseOrThrow(sessionTokensSchema, payload);
};

/**
 * Starts password recovery. 202 whether or not the address has an account — an
 * address with none receives nothing at all. Nothing to parse, and no branch a
 * caller is allowed to take.
 */
export const requestPasswordReset = async (email: string): Promise<void> => {
  await api.post('/auth/password/forgot', { email });
};

/**
 * Redeems the emailed token. Answers 204 and issues NO session: the API revokes
 * every session of the account, so the caller signs in again with the password
 * it just set.
 */
export const resetPassword = async (input: ResetPasswordInput): Promise<void> => {
  await api.post('/auth/password/reset', input);
};

/**
 * Replaces the password of the authenticated user. Revokes every other session
 * and answers with a fresh pair for this device — so the refresh token on disk
 * is dead the moment this resolves and the caller must persist the new one.
 */
export const changePassword = async (input: ChangePasswordInput): Promise<SessionTokens> => {
  const payload = await api.post('/auth/password', {
    ...input,
    refreshTransport: REFRESH_TRANSPORT_BODY,
  });

  return parseOrThrow(sessionTokensSchema, payload);
};
