import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { reportError } from '@/errors';
import { configureAuthorization } from '@/lib';
import { fetchMe, login, refreshSession, register } from '../api/authApi';
import { AUTH_QUERY_KEYS } from '../constants';
import { clearRefreshToken, readRefreshToken, writeRefreshToken } from '../storage';
import type { AuthContextValue } from '../types';
import { isEndedSession, resolveStatus } from '../utils/session';
import { createSingleFlight } from '../utils/singleFlight';
import type { Credentials } from '../validations';

/**
 * Lives with its provider rather than in a file of its own: only `useAuth`
 * reads it, and the provider is the only thing that can fill it. A second
 * context in this module gets its own file in this folder.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

/** A rejected token will be rejected again; retrying only delays the boot. */
const ME_RETRY_COUNT = 0;

export const AuthProvider = ({ children }: PropsWithChildren) => {
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
    // screen for as long as the device stays offline. `login`/`signUp` need
    // the same override, for the mirror reason on the mutation side.
    networkMode: 'always',
  });

  const endSession = useCallback(async () => {
    applyToken(null);
    await clearRefreshToken();
    queryClient.removeQueries({ queryKey: AUTH_QUERY_KEYS.ME });
  }, [applyToken, queryClient]);

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
          const { accessToken, refreshToken } = await refreshSession(stored);

          // Written BEFORE this resolves: the token just spent must not survive
          // a relaunch. If the process dies in this gap the disk holds a spent
          // token, which the API's 30-second grace window exists to forgive.
          await writeRefreshToken(refreshToken);
          applyToken(accessToken);

          return accessToken;
        } catch (error) {
          // Offline, or a 503 the API could not retry away: the caller owns it,
          // and the session stays exactly as it was.
          if (!isEndedSession(error)) throw error;

          await endSession();

          return null;
        }
      }),
    [applyToken, endSession],
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

  const establishSession = useCallback(
    async (credentials: Credentials) => {
      const { accessToken, refreshToken } = await login(credentials);

      await writeRefreshToken(refreshToken);
      applyToken(accessToken);
      // `fetchQuery`, not an invalidation: the user has to be in the cache
      // before this resolves, so the gate swaps in the same tick the screen
      // stops submitting. `networkMode: 'always'` for the same reason as
      // `meQuery` above — this imperative call has its own default and does
      // not inherit the hook's option.
      await queryClient.fetchQuery({
        queryKey: AUTH_QUERY_KEYS.ME,
        queryFn: fetchMe,
        networkMode: 'always',
      });
    },
    [applyToken, queryClient],
  );

  const signInMutation = useMutation({ mutationFn: establishSession, networkMode: 'always' });

  const signUpMutation = useMutation({
    mutationFn: async (credentials: Credentials) => {
      // `POST /auth/register` answers 201 { id } and issues no session, so the
      // login is not optional: without it, creating an account would drop the
      // user straight back onto the sign-in screen.
      await register(credentials);
      await establishSession(credentials);
    },
    networkMode: 'always',
  });

  const signOut = useCallback(async () => {
    await endSession();
    queryClient.clear();
  }, [endSession, queryClient]);

  // Gated on the token rather than read straight off the query: `endSession`
  // empties the cache outside React's render cycle, and an emptied cache
  // schedules no render, so `meQuery.data` would keep serving the profile of
  // the user who just signed out. The token is state, so losing it does render.
  const user = token === null ? null : (meQuery.data ?? null);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: resolveStatus({ hasCompletedBoot, token, user }),
      user,
      signIn: signInMutation.mutateAsync,
      signUp: signUpMutation.mutateAsync,
      signOut,
      isSubmitting: signInMutation.isPending || signUpMutation.isPending,
    }),
    [
      hasCompletedBoot,
      token,
      user,
      signInMutation.mutateAsync,
      signInMutation.isPending,
      signUpMutation.mutateAsync,
      signUpMutation.isPending,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
