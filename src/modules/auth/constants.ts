/** Namespaced so a second module storing a token cannot collide with this one. */
export const ACCESS_TOKEN_STORAGE_KEY = 'auth.accessToken';

/** `as const` so TanStack Query sees a stable, literal key. */
export const AUTH_QUERY_KEYS = {
  ME: ['auth', 'me'],
} as const;
