import type { AUTH_ROUTES } from './constants';

export type AuthStackParamList = {
  [AUTH_ROUTES.SIGN_IN]: undefined;
  [AUTH_ROUTES.SIGN_UP]: undefined;
};
