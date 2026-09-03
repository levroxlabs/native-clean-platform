import { REFRESH_TOKEN_STORAGE_KEY } from './constants';

/**
 * `expo-secure-store` has no web implementation, and this repo supports
 * `pnpm web`. `localStorage` is NOT equivalent: it is readable by any script on
 * the origin. The web target here is a development convenience, not a supported
 * production surface — see this module's README.
 */
export const readRefreshToken = async (): Promise<string | null> =>
  globalThis.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);

export const writeRefreshToken = async (token: string): Promise<void> => {
  globalThis.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
};

export const clearRefreshToken = async (): Promise<void> => {
  globalThis.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
};
