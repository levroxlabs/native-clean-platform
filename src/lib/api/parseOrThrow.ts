import type { z } from 'zod';

import { API_ERROR_CODES, ApiError, CLIENT_FAILURE_STATUS } from './responseInterceptor';

const CONTRACT_DRIFT_MESSAGE = 'The API response did not match the expected shape:';

/**
 * Parsing responses — not just requests — is what turns a silent contract drift
 * between the two repositories into a loud, located failure. It is re-thrown as
 * an `ApiError` so callers still handle exactly one error type.
 */
export const parseOrThrow = <TSchema extends z.ZodType>(
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
