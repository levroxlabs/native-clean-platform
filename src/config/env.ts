const API_BASE_URL_VARIABLE = 'EXPO_PUBLIC_API_URL';

/**
 * Deliberately a regex and not `new URL()` or a zod schema. React Native's
 * `URL` is a partial polyfill, and `new URL('localhost:3000')` succeeds in a
 * full implementation anyway — it reads `localhost:` as the protocol. What
 * this guard has to catch is exactly that mistake.
 */
const HTTP_URL_PATTERN = /^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/;
const TRAILING_SLASH_PATTERN = /\/+$/;

const INVALID_API_BASE_URL_MESSAGE =
  `${API_BASE_URL_VARIABLE} must be the base URL of the API, such as ` +
  'http://localhost:3000. Copy .env.example to .env and set it. An Android ' +
  'emulator reaches the host machine at 10.0.2.2, not localhost.';

/**
 * Split from the constant below so both failure modes are testable without
 * re-importing the module.
 */
export const readApiBaseUrl = (rawValue: string | undefined): string => {
  const value = rawValue?.trim() ?? '';

  if (!HTTP_URL_PATTERN.test(value)) {
    throw new Error(INVALID_API_BASE_URL_MESSAGE);
  }

  return value.replace(TRAILING_SLASH_PATTERN, '');
};

/**
 * Read once, at import time, on purpose: a misconfigured app must die at boot
 * with the message above rather than at its first request with an opaque fetch
 * failure.
 *
 * `process.env.EXPO_PUBLIC_API_URL` must stay written out in full. Babel only
 * rewrites the complete member expression — destructuring `process.env` first
 * leaves the value `undefined` in a release build.
 */
export const API_BASE_URL = readApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);
