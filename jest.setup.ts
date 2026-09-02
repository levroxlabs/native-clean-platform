/**
 * `babel-preset-expo` only inlines EXPO_PUBLIC_* variables in production
 * builds. In development and under Jest it rewrites them to `expo/virtual/env`,
 * which is `export const env = process.env` — so assigning here is read live by
 * `src/config/env.ts` when it loads.
 */
const TEST_API_BASE_URL = 'http://localhost:3000';

process.env.EXPO_PUBLIC_API_URL = TEST_API_BASE_URL;

/**
 * An in-memory keychain. Real `expo-secure-store` needs a native module, and
 * an explicit mock also lets a test assert what was actually stored.
 */
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();

  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});
