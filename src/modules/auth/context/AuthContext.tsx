import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, useCallback, useMemo } from 'react';

import { login, logout, logoutEverywhere, register } from '../api/authApi';
import { useAuthSession } from '../hooks/useAuthSession';
import { readRefreshToken } from '../storage';
import type { AuthContextValue } from '../types';
import type { Credentials } from '../validations';

/**
 * Lives with its provider rather than in a file of its own: only `useAuth`
 * reads it, and the provider is the only thing that can fill it. A second
 * context in this module gets its own file in this folder.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const queryClient = useQueryClient();
  const { status, user, openSession, endSession } = useAuthSession();

  const establishSession = useCallback(
    async (credentials: Credentials) => {
      await openSession(await login(credentials));
    },
    [openSession],
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

  const signOutMutation = useMutation({
    mutationFn: async () => {
      const stored = await readRefreshToken();

      // Best effort: a failure here must not keep the user signed in. The local
      // clear below removes the only copy of the token either way.
      if (stored !== null) await logout(stored).catch(() => undefined);

      await endSession();
      queryClient.clear();
    },
    networkMode: 'always',
  });

  const signOutEverywhereMutation = useMutation({
    mutationFn: async () => {
      // Deliberately uncaught: the caller renders the failure and the session
      // survives, so the user can retry or use the plain sign-out.
      await logoutEverywhere();
      await endSession();
      queryClient.clear();
    },
    networkMode: 'always',
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      signIn: signInMutation.mutateAsync,
      signUp: signUpMutation.mutateAsync,
      signOut: signOutMutation.mutateAsync,
      signOutEverywhere: signOutEverywhereMutation.mutateAsync,
      isSubmitting: signInMutation.isPending || signUpMutation.isPending,
      isSigningOut: signOutMutation.isPending || signOutEverywhereMutation.isPending,
    }),
    [
      status,
      user,
      signInMutation.mutateAsync,
      signInMutation.isPending,
      signUpMutation.mutateAsync,
      signUpMutation.isPending,
      signOutMutation.mutateAsync,
      signOutMutation.isPending,
      signOutEverywhereMutation.mutateAsync,
      signOutEverywhereMutation.isPending,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
