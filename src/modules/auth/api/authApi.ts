import type { z } from 'zod';

import { API_ERROR_CODES, ApiError, api, CLIENT_FAILURE_STATUS } from '@/lib';

import type { Credentials } from '../validations';
import {
  loginResponseSchema,
  registerResponseSchema,
  type SessionTokens,
  sessionTokensSchema,
  type User,
  userSchema,
} from './schemas';

const CONTRACT_DRIFT_MESSAGE = 'The API response did not match the expected shape:';

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

/** Issues no session — the caller must log in afterwards. Returns the new id. */
export const register = async (credentials: Credentials): Promise<string> => {
  const payload = await api.post('/auth/register', credentials);

  return parseOrThrow(registerResponseSchema, payload).id;
};

export const login = async (credentials: Credentials): Promise<string> => {
  const payload = await api.post('/auth/login', credentials);

  return parseOrThrow(loginResponseSchema, payload).accessToken;
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
