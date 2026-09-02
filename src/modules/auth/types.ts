import type { Credentials, User } from './api/schemas';

export const AUTH_STATUSES = {
  LOADING: 'loading',
  SIGNED_OUT: 'signedOut',
  SIGNED_IN: 'signedIn',
} as const;

export type AuthStatus = (typeof AUTH_STATUSES)[keyof typeof AUTH_STATUSES];

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** Rejects with an `ApiError`; screens catch it and map `code` to copy. */
  signIn: (credentials: Credentials) => Promise<void>;
  signUp: (credentials: Credentials) => Promise<void>;
  signOut: () => Promise<void>;
  isSubmitting: boolean;
}
