import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { API_ERROR_CODES, ApiError, configureAuthorization } from '@/services/http';
import { AuthContext } from './AuthContext';
import { fetchMe, login, register } from './api/authApi';
import type { Credentials, User } from './api/schemas';
import { AUTH_QUERY_KEYS } from './constants';
import { clearAccessToken, readAccessToken, writeAccessToken } from './storage';
import { AUTH_STATUSES, type AuthContextValue, type AuthStatus } from './types';

/** A rejected token will be rejected again; retrying only delays the boot. */
const ME_RETRY_COUNT = 0;

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
const resolveStatus = ({ hasCompletedBoot, token, user }: StatusInput): AuthStatus => {
  if (!hasCompletedBoot) return AUTH_STATUSES.LOADING;
  if (token === null || user === null) return AUTH_STATUSES.SIGNED_OUT;

  return AUTH_STATUSES.SIGNED_IN;
};

const isRejectedToken = (error: unknown): boolean =>
  error instanceof ApiError && error.code === API_ERROR_CODES.INVALID_ACCESS_TOKEN;

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
    if (tokenRef.current !== null && isRejectedToken(meQuery.error)) void endSession();
  }, [meQuery.error, endSession]);

  const establishSession = useCallback(
    async (credentials: Credentials) => {
      const accessToken = await login(credentials);

      await writeAccessToken(accessToken);
      applyToken(accessToken);
      // `fetchQuery`, not an invalidation: the user has to be in the cache
      // before this resolves, so the gate swaps in the same tick the screen
      // stops submitting.
      await queryClient.fetchQuery({ queryKey: AUTH_QUERY_KEYS.ME, queryFn: fetchMe });
    },
    [applyToken, queryClient],
  );

  const signInMutation = useMutation({ mutationFn: establishSession });

  const signUpMutation = useMutation({
    mutationFn: async (credentials: Credentials) => {
      // `POST /auth/register` answers 201 { id } and issues no session, so the
      // login is not optional: without it, creating an account would drop the
      // user straight back onto the sign-in screen.
      await register(credentials);
      await establishSession(credentials);
    },
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
