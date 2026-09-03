import type { User } from './api/schemas';
import type { Credentials } from './validations';

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
  /**
   * Ends every session of this account. Unlike `signOut` it rejects on failure
   * and keeps this session: its promise is every device, and a silent
   * degradation to a local sign-out would be a lie.
   */
  signOutEverywhere: () => Promise<void>;
  isSubmitting: boolean;
  /**
   * True while either sign-out is in flight. Separate from `isSubmitting`,
   * which belongs to the credential forms.
   */
  isSigningOut: boolean;
}
