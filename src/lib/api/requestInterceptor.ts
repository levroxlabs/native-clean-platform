import type { InternalAxiosRequestConfig } from 'axios';

const AUTHORIZATION_HEADER = 'Authorization';
const BEARER_PREFIX = 'Bearer ';

/** The pair of callbacks that ties this client to the session. */
export interface AuthorizationHandlers {
  getAccessToken: () => string | null;
  /**
   * Resolves with a fresh access token, or `null` when the session is over — in
   * which case the handler has ALREADY ended it locally. Rejects only when the
   * refresh itself failed for a reason that is not the session (offline, 503),
   * and that rejection is what the caller sees instead of the original 401.
   *
   * The handler serialises its own calls; this client may call it from several
   * failed requests at once.
   */
  refreshAccessToken: () => Promise<string | null>;
}

let handlers: AuthorizationHandlers | null = null;

/**
 * The only tie between this module and the session. `AuthProvider` registers
 * itself on mount and clears the registration on unmount.
 *
 * This module knows only that a 401 with one particular code is worth one
 * retry. Which failures end a session, where the refresh token lives, and what
 * a reused token means all stay in `src/modules/auth/`.
 */
export const configureAuthorization = (next: AuthorizationHandlers | null): void => {
  handlers = next;
};

/** Read by `responseInterceptor.ts` too: the refresh retry needs the same registration. */
export const getAuthorizationHandlers = (): AuthorizationHandlers | null => handlers;

export const requestInterceptor = (
  config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig => {
  const token = handlers?.getAccessToken() ?? null;

  if (token !== null) {
    config.headers.set(AUTHORIZATION_HEADER, `${BEARER_PREFIX}${token}`);
  }

  return config;
};
