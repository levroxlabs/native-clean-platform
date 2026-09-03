import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import {
  API_ERROR_CODES,
  ApiError,
  api,
  configureAuthorization,
  HTTP_METHODS,
  request,
} from './api';

const BASE_URL = 'http://localhost:3000';
const PATH = '/auth/me';
const TOKEN = 'a-token';

const OK_STATUS = 200;
const LOWEST_ERROR_STATUS = 300;

let lastConfig: InternalAxiosRequestConfig;

const envelope = (code: string, extra: Record<string, unknown> = {}) => ({
  error: { code, message: 'human readable', traceId: 'trace-1', ...extra },
});

/**
 * Every real axios adapter ends in `settle()`, which rejects with an
 * `AxiosError` carrying the response whenever `validateStatus` fails. Mirroring
 * that here is what makes the interceptors see exactly what they see in the
 * app — the alternative, forcing the `fetch` adapter, would test a network
 * stack React Native does not pick by default.
 */
const respondWith = (status: number, data: unknown) => {
  api.defaults.adapter = async (config) => {
    lastConfig = config;
    const response = { data, status, statusText: '', headers: {}, config } as AxiosResponse;

    if (status >= OK_STATUS && status < LOWEST_ERROR_STATUS) return response;

    throw new AxiosError('Request failed', String(status), config, null, response);
  };
};

const failWithoutResponse = () => {
  api.defaults.adapter = async (config) => {
    lastConfig = config;

    throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, null);
  };
};

beforeEach(() => {
  configureAuthorization(null);
});

describe('request', () => {
  it('prefixes the base URL and returns the parsed body', async () => {
    respondWith(OK_STATUS, { id: 'user-1' });

    await expect(request(PATH)).resolves.toEqual({ id: 'user-1' });
    expect(lastConfig.baseURL).toBe(BASE_URL);
    expect(lastConfig.url).toBe(PATH);
  });

  it('serializes the body and sets the JSON content type on a POST', async () => {
    respondWith(OK_STATUS, {});

    await request(PATH, { method: HTTP_METHODS.POST, body: { email: 'a@b.co' } });

    expect(lastConfig.method).toBe('post');
    expect(lastConfig.data).toBe(JSON.stringify({ email: 'a@b.co' }));
    expect(lastConfig.headers.get('Content-Type')).toBe('application/json');
  });

  it('attaches the bearer token when a provider returns one', async () => {
    respondWith(OK_STATUS, {});
    configureAuthorization({ getAccessToken: () => TOKEN, onUnauthorized: jest.fn() });

    await request(PATH);

    expect(lastConfig.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('omits the header when there is no token', async () => {
    respondWith(OK_STATUS, {});
    configureAuthorization({ getAccessToken: () => null, onUnauthorized: jest.fn() });

    await request(PATH);

    expect(lastConfig.headers.get('Authorization')).toBeUndefined();
  });

  it('returns null for a 204, which carries no body', async () => {
    respondWith(204, '');

    await expect(request(PATH)).resolves.toBeNull();
  });

  it('turns the error envelope into an ApiError carrying code, details and traceId', async () => {
    respondWith(
      400,
      envelope(API_ERROR_CODES.VALIDATION_ERROR, {
        details: [{ field: 'email', code: 'invalid_format' }],
      }),
    );

    await expect(request(PATH)).rejects.toMatchObject({
      status: 400,
      code: API_ERROR_CODES.VALIDATION_ERROR,
      details: [{ field: 'email', code: 'invalid_format' }],
      traceId: 'trace-1',
    });
  });

  it('still throws an ApiError when the error body is not the envelope', async () => {
    respondWith(502, '<html>bad gateway</html>');

    await expect(request(PATH)).rejects.toMatchObject({
      status: 502,
      code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
    });
  });

  it('ends the session on a 401 caused by the access token', async () => {
    const onUnauthorized = jest.fn();
    respondWith(401, envelope(API_ERROR_CODES.INVALID_ACCESS_TOKEN));
    configureAuthorization({ getAccessToken: () => TOKEN, onUnauthorized });

    await expect(request(PATH)).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does NOT end the session on the 401 a wrong password produces', async () => {
    const onUnauthorized = jest.fn();
    respondWith(401, envelope(API_ERROR_CODES.INVALID_CREDENTIALS));
    configureAuthorization({ getAccessToken: () => null, onUnauthorized });

    await expect(request(PATH)).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('turns a request that never got a response into a NETWORK_ERROR ApiError', async () => {
    failWithoutResponse();

    await expect(request(PATH)).rejects.toMatchObject({
      status: 0,
      code: API_ERROR_CODES.NETWORK_ERROR,
    });
  });
});
