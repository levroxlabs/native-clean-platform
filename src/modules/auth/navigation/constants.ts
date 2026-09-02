/** This module's screens only. The root stack never learns these names. */
export const AUTH_ROUTES = {
  SIGN_IN: 'SignIn',
  SIGN_UP: 'SignUp',
} as const;

export type AuthRoute = (typeof AUTH_ROUTES)[keyof typeof AUTH_ROUTES];
