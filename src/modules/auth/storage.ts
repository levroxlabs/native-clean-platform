import * as SecureStore from 'expo-secure-store';

import { ACCESS_TOKEN_STORAGE_KEY } from './constants';

/**
 * The native implementation: the iOS keychain and the Android keystore. The web
 * build resolves `storage.web.ts` instead — Metro picks the platform suffix.
 */
export const readAccessToken = async (): Promise<string | null> =>
  SecureStore.getItemAsync(ACCESS_TOKEN_STORAGE_KEY);

export const writeAccessToken = async (token: string): Promise<void> =>
  SecureStore.setItemAsync(ACCESS_TOKEN_STORAGE_KEY, token);

export const clearAccessToken = async (): Promise<void> =>
  SecureStore.deleteItemAsync(ACCESS_TOKEN_STORAGE_KEY);
