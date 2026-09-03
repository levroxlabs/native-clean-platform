import type { z } from 'zod';

import { API_ERROR_CODES, ApiError, api, CLIENT_FAILURE_STATUS } from '@/lib';

import type { Credentials } from '../validations';
import { loginResponseSchema, registerResponseSchema, type User, userSchema } from './schemas';

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
