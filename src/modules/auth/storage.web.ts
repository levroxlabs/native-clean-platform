import { ACCESS_TOKEN_STORAGE_KEY } from './constants';

/**
 * `expo-secure-store` has no web implementation, and this repo supports
 * `pnpm web`. `localStorage` is NOT equivalent: it is readable by any script on
 * the origin. The web target here is a development convenience, not a supported
 * production surface — see this module's README.
 */
export const readAccessToken = async (): Promise<string | null> =>
  globalThis.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);

export const writeAccessToken = async (token: string): Promise<void> => {
  globalThis.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
};

export const clearAccessToken = async (): Promise<void> => {
  globalThis.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
};
