import { API_BASE_URL } from '@/config';

import { ApiError } from './ApiError';
import { API_ERROR_CODES } from './errorCodes';
import {
  type AuthorizationHandlers,
  type ErrorEnvelope,
  HTTP_METHODS,
  type RequestOptions,
} from './types';

const REQUEST_TIMEOUT_MS = 15000;

const UNAUTHORIZED_STATUS = 401;
const NO_CONTENT_STATUS = 204;
/** No HTTP status exists: the request failed on this side of the wire. */
export const CLIENT_FAILURE_STATUS = 0;

const AUTHORIZATION_HEADER = 'Authorization';
const CONTENT_TYPE_HEADER = 'Content-Type';
const BEARER_PREFIX = 'Bearer ';
const JSON_CONTENT_TYPE = 'application/json';

const NETWORK_ERROR_MESSAGE = 'The request did not reach the API.';
const UNEXPECTED_RESPONSE_MESSAGE = 'The API answered with an unexpected body.';

let handlers: AuthorizationHandlers | null = null;

/**
 * The only tie between this module and the session. `AuthProvider` registers
 * itself on mount and clears the registration on unmount.
 *
 * This is where token refresh goes when the API grows `POST /auth/refresh`:
 * `onUnauthorized` attempts the refresh and retries, instead of ending the
 * session. Nothing else in the app changes — spec §9.
 */
export const configureAuthorization = (next: AuthorizationHandlers | null): void => {
  handlers = next;
};

const buildHeaders = (hasBody: boolean): Record<string, string> => {
  const headers: Record<string, string> = {};
  const token = handlers?.getAccessToken() ?? null;

  if (hasBody) headers[CONTENT_TYPE_HEADER] = JSON_CONTENT_TYPE;
  if (token !== null) headers[AUTHORIZATION_HEADER] = `${BEARER_PREFIX}${token}`;

  return headers;
};

const isErrorEnvelope = (body: unknown): body is ErrorEnvelope => {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;

  const { error } = body as { error: unknown };

  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string'
  );
};

const readJson = async (response: Response): Promise<unknown> => {
  if (response.status === NO_CONTENT_STATUS) return null;

  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const request = async <TResponse>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> => {
  const { method = HTTP_METHODS.GET, body } = options;
  const controller = new AbortController();
  // NOT `AbortSignal.timeout()`: React Native polyfills AbortSignal with
  // abort-controller@3, which has no static timeout(). Node — and therefore
  // Jest — does have it, so the mistake would pass every test and crash the app.
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: buildHeaders(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // Swallowed on purpose: a DNS failure, an offline radio and a timeout are
    // one state to a caller, and the library's message is not contract.
    throw new ApiError({
      status: CLIENT_FAILURE_STATUS,
      code: API_ERROR_CODES.NETWORK_ERROR,
      message: NETWORK_ERROR_MESSAGE,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await readJson(response);

  if (response.ok) return payload as TResponse;

  if (!isErrorEnvelope(payload)) {
    throw new ApiError({
      status: response.status,
      code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
      message: UNEXPECTED_RESPONSE_MESSAGE,
    });
  }

  // Only a token failure ends the session. A 401 from `/auth/login` means the
  // password was wrong — signing the user out there would be answering a failed
  // guess by destroying a session that does not exist.
  if (
    response.status === UNAUTHORIZED_STATUS &&
    payload.error.code === API_ERROR_CODES.INVALID_ACCESS_TOKEN
  ) {
    handlers?.onUnauthorized();
  }

  throw new ApiError({
    status: response.status,
    code: payload.error.code,
    message: payload.error.message,
    details: payload.error.details ?? [],
    traceId: payload.error.traceId,
  });
};
