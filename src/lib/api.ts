import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { API_BASE_URL } from '@/config';

const REQUEST_TIMEOUT_MS = 15000;

const UNAUTHORIZED_STATUS = 401;
const NO_CONTENT_STATUS = 204;
/** No HTTP status exists: the request failed on this side of the wire. */
export const CLIENT_FAILURE_STATUS = 0;

const AUTHORIZATION_HEADER = 'Authorization';
const BEARER_PREFIX = 'Bearer ';

const NETWORK_ERROR_MESSAGE = 'The request did not reach the API.';
const UNEXPECTED_RESPONSE_MESSAGE = 'The API answered with an unexpected body.';

/**
 * The API's stable error codes, copied from `api-clean-platform`. `code` is
 * contract on both sides; `message` is not, and is never rendered raw.
 *
 * The client's own two codes are marked. A code arriving from the API that is
 * absent here is not an error — `ApiError.code` is a plain string precisely so
 * a new server code degrades to the fallback copy instead of crashing.
 */
export const API_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  INVALID_ACCESS_TOKEN: 'INVALID_ACCESS_TOKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_EMAIL: 'INVALID_EMAIL',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  /** The refresh token is unknown, expired, or was not presented at all. */
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  /**
   * A spent refresh token came back outside the API's 30-second grace window.
   * The whole session family is already revoked by the time this arrives.
   */
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  /** The API rejected the request for exceeding a per-IP ceiling. Arrives as a 429. */
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  /** 403 on login: the password was right, the account is not verified. */
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  /**
   * 422 from `/auth/email/verify`. One code for every failure mode — unknown,
   * wrong, expired, attempts exhausted — so the client cannot build an oracle
   * the API deliberately refused to give it.
   */
  EMAIL_VERIFICATION_FAILED: 'EMAIL_VERIFICATION_FAILED',
  /** 422 from `/auth/password/reset`. One code for every token failure, as above. */
  PASSWORD_RESET_FAILED: 'PASSWORD_RESET_FAILED',
  /** 422 from `/auth/password`: the current password did not match. */
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
  /** 422 from `/auth/password`: the new password equals the current one. */
  PASSWORD_UNCHANGED: 'PASSWORD_UNCHANGED',
  /** A database conflict that survived the API's own retries. Arrives as a 503. */
  TRANSACTION_CONFLICT: 'TRANSACTION_CONFLICT',
  /** Client-side: the request never reached the API. */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** Client-side: the API answered something that is not the agreed shape. */
  UNEXPECTED_RESPONSE: 'UNEXPECTED_RESPONSE',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/** Internal only: each method on `api` below already fixes its own value. */
const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
} as const;

type HttpMethod = (typeof HTTP_METHODS)[keyof typeof HTTP_METHODS];

/** One entry of the API's `details` array on a 400. */
export interface ValidationDetail {
  field?: string;
  code: string;
}

/** The single shape every API error arrives in. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: ValidationDetail[];
    traceId: string;
  };
}

/** The pair of callbacks that ties this client to the session. */
export interface AuthorizationHandlers {
  getAccessToken: () => string | null;
  /**
   * Resolves with a fresh access token, or `null` when the session is over — in
   * which case the handler has ALREADY ended it locally. Rejects only when the
   * refresh itself failed for a reason that is not the session (offline, 503),
   * and that rejection is what the caller sees instead of the original 401.
   *
   * The handler serialises its own calls; this client may call it from several
   * failed requests at once.
   */
  refreshAccessToken: () => Promise<string | null>;
}

const API_ERROR_NAME = 'ApiError';
const NO_TRACE_ID = '';

interface ApiErrorInput {
  status: number;
  code: string;
  message: string;
  details?: ValidationDetail[];
  traceId?: string;
}

/**
 * Every failure this client throws — HTTP or not — so callers handle one type
 * and branch on `code`.
 *
 * A class rather than a factory: `instanceof` is what a caller needs, and it is
 * the one thing a plain object cannot give.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ValidationDetail[];
  readonly traceId: string;

  constructor({ status, code, message, details = [], traceId = NO_TRACE_ID }: ApiErrorInput) {
    super(message);
    this.name = API_ERROR_NAME;
    this.status = status;
    this.code = code;
    this.details = details;
    this.traceId = traceId;
  }
}

let handlers: AuthorizationHandlers | null = null;

/**
 * The only tie between this module and the session. `AuthProvider` registers
 * itself on mount and clears the registration on unmount.
 *
 * This module knows only that a 401 with one particular code is worth one
 * retry. Which failures end a session, where the refresh token lives, and what
 * a reused token means all stay in `src/modules/auth/`.
 */
export const configureAuthorization = (next: AuthorizationHandlers | null): void => {
  handlers = next;
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

/**
 * Exported for the colocated test, which swaps `defaults.adapter` to exercise
 * these interceptors without a network. Deliberately **not** re-exported by
 * `index.ts`: outside this folder the only way in is `api`, so the bearer
 * token and the error translation cannot be bypassed.
 */
export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
});

axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = handlers?.getAccessToken() ?? null;

  if (token !== null) config.headers.set(AUTHORIZATION_HEADER, `${BEARER_PREFIX}${token}`);

  return config;
});

const toApiError = (error: AxiosError): ApiError => {
  const { response } = error;

  // No response at all: DNS failure, offline radio or the timeout above. They
  // are one state to a caller, and axios's message is not contract.
  if (response === undefined) {
    return new ApiError({
      status: CLIENT_FAILURE_STATUS,
      code: API_ERROR_CODES.NETWORK_ERROR,
      message: NETWORK_ERROR_MESSAGE,
    });
  }

  if (!isErrorEnvelope(response.data)) {
    return new ApiError({
      status: response.status,
      code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
      message: UNEXPECTED_RESPONSE_MESSAGE,
    });
  }

  const { error: envelope } = response.data;

  return new ApiError({
    status: response.status,
    code: envelope.code,
    message: envelope.message,
    details: envelope.details ?? [],
    traceId: envelope.traceId,
  });
};

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  /** Set on the repeat, so a second 401 cannot start another refresh. */
  hasRetriedAfterRefresh?: boolean;
}

/**
 * Only a dead access token is worth refreshing. A wrong password is a 401 too,
 * and `/auth/refresh` and `/auth/logout` answer `INVALID_REFRESH_TOKEN` — so
 * the API's distinct codes are what keep this from needing a per-request
 * opt-out flag.
 */
const shouldAttemptRefresh = (error: ApiError, config: RetriableRequestConfig): boolean =>
  error.status === UNAUTHORIZED_STATUS &&
  error.code === API_ERROR_CODES.INVALID_ACCESS_TOKEN &&
  config.hasRetriedAfterRefresh !== true;

axiosInstance.interceptors.response.use(undefined, async (error: AxiosError) => {
  const apiError = toApiError(error);
  const config = error.config as RetriableRequestConfig | undefined;

  if (handlers === null || config === undefined || !shouldAttemptRefresh(apiError, config)) {
    throw apiError;
  }

  // A rejection here is NOT a dead session — it is the refresh's own failure,
  // and it propagates in place of the 401 so the caller sees why it really
  // failed. `null` is the dead session, and the handler has already cleaned up.
  const accessToken = await handlers.refreshAccessToken();

  if (accessToken === null) throw apiError;

  const retried: RetriableRequestConfig = { ...config, hasRetriedAfterRefresh: true };

  return axiosInstance.request(retried);
});

const send = async <TResponse>(
  path: string,
  method: HttpMethod,
  body?: unknown,
): Promise<TResponse> => {
  const response: AxiosResponse = await axiosInstance.request({ url: path, method, data: body });

  return (response.status === NO_CONTENT_STATUS ? null : response.data) as TResponse;
};

/**
 * The only way into this client. One method per HTTP verb the app uses, so a
 * call site never repeats which method it means — `api.post(path, body)`
 * reads as what it does, instead of `request(path, { method: 'POST', body })`.
 */
export const api = {
  get: <TResponse>(path: string): Promise<TResponse> => send<TResponse>(path, HTTP_METHODS.GET),
  post: <TResponse>(path: string, body?: unknown): Promise<TResponse> =>
    send<TResponse>(path, HTTP_METHODS.POST, body),
  patch: <TResponse>(path: string, body?: unknown): Promise<TResponse> =>
    send<TResponse>(path, HTTP_METHODS.PATCH, body),
  delete: <TResponse>(path: string): Promise<TResponse> =>
    send<TResponse>(path, HTTP_METHODS.DELETE),
};
