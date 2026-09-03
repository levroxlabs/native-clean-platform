import * as SecureStore from 'expo-secure-store';

import { REFRESH_TOKEN_STORAGE_KEY } from './constants';

/**
 * The native implementation: the iOS keychain and the Android keystore. The web
 * build resolves `storage.web.ts` instead — Metro picks the platform suffix.
 */
export const readRefreshToken = async (): Promise<string | null> =>
  SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY);

export const writeRefreshToken = async (token: string): Promise<void> =>
  SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, token);

export const clearRefreshToken = async (): Promise<void> =>
  SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY);
