import axios, { type AxiosResponse } from 'axios';

import { API_BASE_URL } from '@/config';

import { requestInterceptor } from './requestInterceptor';
import { createResponseInterceptor } from './responseInterceptor';

const REQUEST_TIMEOUT_MS = 15000;
const NO_CONTENT_STATUS = 204;

/** Internal only: each method on `api` below already fixes its own value. */
const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
} as const;

type HttpMethod = (typeof HTTP_METHODS)[keyof typeof HTTP_METHODS];

/**
 * Exported for the colocated test, which swaps `defaults.adapter` to exercise
 * the interceptors without a network. Deliberately **not** re-exported by
 * `index.ts`: outside this folder the only way in is `api`, so the bearer
 * token and the error translation cannot be bypassed.
 */
export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
});

axiosInstance.interceptors.request.use(requestInterceptor);
axiosInstance.interceptors.response.use(undefined, createResponseInterceptor(axiosInstance));

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
  delete: <TResponse>(path: string, body?: unknown): Promise<TResponse> =>
    send<TResponse>(path, HTTP_METHODS.DELETE, body),
};
