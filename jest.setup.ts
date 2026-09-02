/**
 * `babel-preset-expo` only inlines EXPO_PUBLIC_* variables in production
 * builds. In development and under Jest it rewrites them to `expo/virtual/env`,
 * which is `export const env = process.env` — so assigning here is read live by
 * `src/config/env.ts` when it loads.
 */
const TEST_API_BASE_URL = 'http://localhost:3000';

process.env.EXPO_PUBLIC_API_URL = TEST_API_BASE_URL;
