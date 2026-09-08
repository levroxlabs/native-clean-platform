import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  changePassword as changePasswordRequest,
  confirmSignUp as confirmSignUpRequest,
  login,
  logout,
  logoutEverywhere,
  register,
} from '../api/authApi';
import { readRefreshToken } from '../storage';
import type { ChangePasswordValues, ConfirmSignUpValues, Credentials } from '../validations';
import type { AuthSessionValue } from './useAuthSession';

export interface AuthActionsValue {
  signIn: (credentials: Credentials) => Promise<void>;
  signUp: (credentials: Credentials) => Promise<void>;
  confirmSignUp: (values: ConfirmSignUpValues) => Promise<void>;
  changePassword: (values: ChangePasswordValues) => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  isSubmitting: boolean;
  isSigningOut: boolean;
}

/**
 * Everything a user can DO to a session, given the primitives that own one.
 *
 * Only calls that produce or destroy a session live here. `startSignUp`,
 * `resendVerificationCode`, `requestPasswordReset` and `resetPassword` write no
 * token, read no token and change no status — their screens call the API
 * directly, and putting them here would make `isSubmitting` mean four unrelated
 * things at once.
 *
 * Every mutation sets `networkMode: 'always'`: the app-wide default PAUSES a
 * mutation while the device is offline, which leaves a submit stuck forever
 * instead of failing where the form can show it.
 */
export const useAuthActions = ({
  adoptTokens,
  openSession,
  endSession,
}: AuthSessionValue): AuthActionsValue => {
  const queryClient = useQueryClient();

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

  const confirmSignUpMutation = useMutation({
    mutationFn: async ({ email, code, password }: ConfirmSignUpValues) => {
      // `confirmPassword` is a client-only field and is deliberately not
      // forwarded: the API's body has no place for it.
      await openSession(await confirmSignUpRequest({ email, code, password }));
    },
    networkMode: 'always',
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ currentPassword, newPassword }: ChangePasswordValues) => {
      // `adoptTokens` and not `openSession`: the profile is already cached and
      // unchanged. What must happen is the write — the API revoked every other
      // session, so the refresh token on disk is dead and its replacement is in
      // this response.
      await adoptTokens(await changePasswordRequest({ currentPassword, newPassword }));
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

  // Memoised so the provider's own `useMemo` has a stable dependency: a new
  // object every render would rebuild the context value on every render.
  return useMemo(
    () => ({
      signIn: signInMutation.mutateAsync,
      signUp: signUpMutation.mutateAsync,
      confirmSignUp: confirmSignUpMutation.mutateAsync,
      changePassword: changePasswordMutation.mutateAsync,
      signOut: signOutMutation.mutateAsync,
      signOutEverywhere: signOutEverywhereMutation.mutateAsync,
      isSubmitting:
        signInMutation.isPending ||
        signUpMutation.isPending ||
        confirmSignUpMutation.isPending ||
        changePasswordMutation.isPending,
      isSigningOut: signOutMutation.isPending || signOutEverywhereMutation.isPending,
    }),
    [
      signInMutation.mutateAsync,
      signInMutation.isPending,
      signUpMutation.mutateAsync,
      signUpMutation.isPending,
      confirmSignUpMutation.mutateAsync,
      confirmSignUpMutation.isPending,
      changePasswordMutation.mutateAsync,
      changePasswordMutation.isPending,
      signOutMutation.mutateAsync,
      signOutMutation.isPending,
      signOutEverywhereMutation.mutateAsync,
      signOutEverywhereMutation.isPending,
    ],
  );
};
