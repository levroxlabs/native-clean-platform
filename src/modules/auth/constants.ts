/**
 * Namespaced so a second module storing a token cannot collide with this one.
 *
 * Only the refresh token is persisted: the access token lives in memory for the
 * life of the process, so a credential valid for a full hour never reaches disk.
 */
export const REFRESH_TOKEN_STORAGE_KEY = 'auth.refreshToken';

/** `as const` so TanStack Query sees a stable, literal key. */
export const AUTH_QUERY_KEYS = {
  ME: ['auth', 'me'],
} as const;
