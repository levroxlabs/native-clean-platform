import { classifyError, ERROR_KINDS } from '@/errors';

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

/**
 * The session is over, as opposed to the request being wrong or the device
 * being offline. Delegated to `classifyError` rather than listing the codes
 * again: the error layer already owns "what kind of failure is this", and two
 * lists of the same three codes would drift the day a fourth one lands.
 */
export const isEndedSession = (error: unknown): boolean =>
  classifyError(error) === ERROR_KINDS.SESSION;
