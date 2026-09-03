import { API_ERROR_CODES, ApiError } from '@/lib';

import type { User } from '../api/schemas';
import { AUTH_STATUSES, type AuthStatus } from '../types';

interface StatusInput {
  hasCompletedBoot: boolean;
  token: string | null;
  user: User | null;
}

/**
 * `loading` means boot, and only boot — otherwise signing in would unmount the
 * sign-in screen into a full-screen splash mid-submit. And a token alone is not
 * a session: only `/auth/me` can say whether it still verifies.
 */
export const resolveStatus = ({ hasCompletedBoot, token, user }: StatusInput): AuthStatus => {
  if (!hasCompletedBoot) return AUTH_STATUSES.LOADING;
  if (token === null || user === null) return AUTH_STATUSES.SIGNED_OUT;

  return AUTH_STATUSES.SIGNED_IN;
};

export const isRejectedToken = (error: unknown): boolean =>
  error instanceof ApiError && error.code === API_ERROR_CODES.INVALID_ACCESS_TOKEN;
