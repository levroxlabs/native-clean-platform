/** Matches AUTH_PREFIX in the API's `src/main/app.ts`. */
const AUTH_PREFIX = '/auth';

export const AUTH_ENDPOINTS = {
  REGISTER: `${AUTH_PREFIX}/register`,
  LOGIN: `${AUTH_PREFIX}/login`,
  ME: `${AUTH_PREFIX}/me`,
} as const;
