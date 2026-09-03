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

import { configureAuthorization } from '@/lib';
import { fetchMe, login, register } from '../api/authApi';
import { AUTH_QUERY_KEYS } from '../constants';
import { clearAccessToken, readAccessToken, writeAccessToken } from '../storage';
import type { AuthContextValue } from '../types';
import { isEndedSession, resolveStatus } from '../utils/session';
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
    await clearAccessToken();
    queryClient.removeQueries({ queryKey: AUTH_QUERY_KEYS.ME });
  }, [applyToken, queryClient]);

  useEffect(() => {
    configureAuthorization({
      getAccessToken: () => tokenRef.current,
      onUnauthorized: () => {
        void endSession();
      },
    });

    return () => configureAuthorization(null);
  }, [endSession]);

  // Boot: restore whatever the keychain holds, exactly once.
  useEffect(() => {
    let isMounted = true;

    const restore = async () => {
      const stored = await readAccessToken();

      if (!isMounted) return;

      applyToken(stored);
      // With no token there is nothing to verify, so boot is already over.
      if (stored === null) setHasCompletedBoot(true);
    };

    void restore();

    return () => {
      isMounted = false;
    };
  }, [applyToken]);

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
      const accessToken = await login(credentials);

      await writeAccessToken(accessToken);
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
