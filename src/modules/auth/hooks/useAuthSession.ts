import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { reportError } from '@/errors';
import { configureAuthorization } from '@/lib';

import { fetchMe, refreshSession } from '../api/authApi';
import type { SessionTokens, User } from '../api/schemas';
import { AUTH_QUERY_KEYS } from '../constants';
import { clearRefreshToken, readRefreshToken, writeRefreshToken } from '../storage';
import type { AuthStatus } from '../types';
import { isEndedSession, resolveStatus } from '../utils/session';
import { createSingleFlight } from '../utils/singleFlight';

/** A rejected token will be rejected again; retrying only delays the boot. */
const ME_RETRY_COUNT = 0;

export interface AuthSessionValue {
  status: AuthStatus;
  user: User | null;
  /** Persists the refresh token and applies the access token. No profile fetch. */
  adoptTokens: (tokens: SessionTokens) => Promise<void>;
  /** `adoptTokens`, then puts the profile in the cache before resolving. */
  openSession: (tokens: SessionTokens) => Promise<void>;
  endSession: () => Promise<void>;
}

/**
 * Everything that decides whether there is a session: the token, the boot that
 * restores one, the single-flight refresh that keeps it, and the profile query
 * that says whether the token still verifies.
 *
 * Split from the provider so the mutations that USE a session live next to each
 * other in `useAuthActions` rather than inside the machinery that produces one.
 */
export const useAuthSession = (): AuthSessionValue => {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [hasCompletedBoot, setHasCompletedBoot] = useState(false);
  // The registered `getAccessToken` has to read the CURRENT token without the
  // effect below re-running on every change, so state and ref move together.
  const tokenRef = useRef<string | null>(null);

  const applyToken = useCallback((next: string | null) => {
    tokenRef.current = next;
    setToken(next);
  }, []);

  const meQuery = useQuery({
    queryKey: AUTH_QUERY_KEYS.ME,
    queryFn: fetchMe,
    enabled: token !== null,
    retry: ME_RETRY_COUNT,
    // The app-wide default pauses a query while offline instead of running it,
    // so it never reaches isSuccess or isError. The boot gate below waits for
    // one of those, so a paused boot query would trap the app on the splash
    // screen for as long as the device stays offline. The mutations need the
    // same override, for the mirror reason on the mutation side.
    networkMode: 'always',
  });

  const endSession = useCallback(async () => {
    applyToken(null);
    await clearRefreshToken();
    queryClient.removeQueries({ queryKey: AUTH_QUERY_KEYS.ME });
  }, [applyToken, queryClient]);

  /**
   * Persist first, then apply. The token just spent must not survive a relaunch,
   * and a process death in this gap leaves a spent token on disk — which is
   * exactly what the API's 30-second grace window exists to forgive.
   */
  const adoptTokens = useCallback(
    async ({ accessToken, refreshToken }: SessionTokens) => {
      await writeRefreshToken(refreshToken);
      applyToken(accessToken);
    },
    [applyToken],
  );

  /**
   * `fetchQuery`, not an invalidation: the user has to be in the cache before
   * this resolves, so the gate swaps in the same tick the screen stops
   * submitting. `networkMode: 'always'` for the same reason as `meQuery` above —
   * this imperative call has its own default and does not inherit the hook's
   * option.
   */
  const openSession = useCallback(
    async (tokens: SessionTokens) => {
      await adoptTokens(tokens);
      await queryClient.fetchQuery({
        queryKey: AUTH_QUERY_KEYS.ME,
        queryFn: fetchMe,
        networkMode: 'always',
      });
    },
    [adoptTokens, queryClient],
  );

  /**
   * The only place a refresh happens, and it happens once at a time — the API
   * requires it: two concurrent refreshes of the same token return two tokens
   * and only the last one issued stays valid.
   *
   * Its three answers are the contract `src/lib/api.ts` reads: a token means
   * retry, `null` means the session is over AND has already been cleared here,
   * and a rejection means the refresh itself failed with the session intact.
   */
  const refreshAccessToken = useMemo(
    () =>
      createSingleFlight(async (): Promise<string | null> => {
        const stored = await readRefreshToken();

        if (stored === null) {
          await endSession();

          return null;
        }

        try {
          const tokens = await refreshSession(stored);

          await adoptTokens(tokens);

          return tokens.accessToken;
        } catch (error) {
          // Offline, or a 503 the API could not retry away: the caller owns it,
          // and the session stays exactly as it was.
          if (!isEndedSession(error)) throw error;

          await endSession();

          return null;
        }
      }),
    [adoptTokens, endSession],
  );

  useEffect(() => {
    configureAuthorization({
      getAccessToken: () => tokenRef.current,
      refreshAccessToken,
    });

    return () => configureAuthorization(null);
  }, [refreshAccessToken]);

  // Boot: spend whatever refresh token storage holds, exactly once.
  useEffect(() => {
    let isMounted = true;

    const restore = async () => {
      const stored = await readRefreshToken();

      if (!isMounted) return;

      if (stored === null) {
        setHasCompletedBoot(true);

        return;
      }

      try {
        const accessToken = await refreshAccessToken();

        if (!isMounted) return;

        // A token hands boot over to `meQuery`; null means the runner already
        // cleared the session, so there is nothing left to wait for.
        if (accessToken === null) setHasCompletedBoot(true);
      } catch (error) {
        if (!isMounted) return;

        // Not a TanStack Query call, so the global QueryCache callback that
        // toasts a failed boot cannot see this one. Without this the user would
        // land on the sign-in screen with no explanation.
        reportError(error);
        setHasCompletedBoot(true);
      }
    };

    void restore();

    return () => {
      isMounted = false;
    };
  }, [refreshAccessToken]);

  // Boot ends when the restored token has been answered for, either way.
  useEffect(() => {
    if (hasCompletedBoot) return;
    if (meQuery.isSuccess || meQuery.isError) setHasCompletedBoot(true);
  }, [hasCompletedBoot, meQuery.isSuccess, meQuery.isError]);

  // A token the API rejected must not survive in the keychain. Only a rejected
  // token, though: being offline at launch is no reason to make the user type
  // their password again on the next one.
  useEffect(() => {
    if (tokenRef.current !== null && isEndedSession(meQuery.error)) void endSession();
  }, [meQuery.error, endSession]);

  // Gated on the token rather than read straight off the query: `endSession`
  // empties the cache outside React's render cycle, and an emptied cache
  // schedules no render, so `meQuery.data` would keep serving the profile of
  // the user who just signed out. The token is state, so losing it does render.
  const user = token === null ? null : (meQuery.data ?? null);

  return {
    status: resolveStatus({ hasCompletedBoot, token, user }),
    user,
    adoptTokens,
    openSession,
    endSession,
  };
};
