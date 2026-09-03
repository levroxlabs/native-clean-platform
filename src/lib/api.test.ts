import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { API_ERROR_CODES, ApiError, api, axiosInstance, configureAuthorization } from './api';

const BASE_URL = 'http://localhost:3000';
const PATH = '/auth/me';
const TOKEN = 'a-token';
const FRESH_TOKEN = 'a-fresh-token';

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
  axiosInstance.defaults.adapter = async (config) => {
    lastConfig = config;
    const response = { data, status, statusText: '', headers: {}, config } as AxiosResponse;

    if (status >= OK_STATUS && status < LOWEST_ERROR_STATUS) return response;

    throw new AxiosError('Request failed', String(status), config, null, response);
  };
};

interface CannedResponse {
  status: number;
  data: unknown;
}

/**
 * Answers a different response per call, so a test can watch the retry: the
 * first call fails, the second succeeds. The last entry repeats for any call
 * beyond the list.
 */
const respondInOrder = (responses: readonly [CannedResponse, ...CannedResponse[]]) => {
  let callCount = 0;
  // The tuple's required first entry is what makes the lookup below total under
  // `noUncheckedIndexedAccess`.
  const [firstResponse] = responses;

  axiosInstance.defaults.adapter = async (config) => {
    lastConfig = config;
    const { status, data } = responses[Math.min(callCount, responses.length - 1)] ?? firstResponse;
    callCount += 1;

    const response = { data, status, statusText: '', headers: {}, config } as AxiosResponse;

    if (status >= OK_STATUS && status < LOWEST_ERROR_STATUS) return response;

    throw new AxiosError('Request failed', String(status), config, null, response);
  };

  return { getCallCount: () => callCount };
};

const failWithoutResponse = () => {
  axiosInstance.defaults.adapter = async (config) => {
    lastConfig = config;

    throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, null);
  };
};

beforeEach(() => {
  configureAuthorization(null);
});

describe('api.get', () => {
  it('prefixes the base URL and returns the parsed body', async () => {
    respondWith(OK_STATUS, { id: 'user-1' });

    await expect(api.get(PATH)).resolves.toEqual({ id: 'user-1' });
    expect(lastConfig.baseURL).toBe(BASE_URL);
    expect(lastConfig.url).toBe(PATH);
    expect(lastConfig.method).toBe('get');
  });

  it('attaches the bearer token when a provider returns one', async () => {
    respondWith(OK_STATUS, {});
    configureAuthorization({ getAccessToken: () => TOKEN, refreshAccessToken: jest.fn() });

    await api.get(PATH);

    expect(lastConfig.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('omits the header when there is no token', async () => {
    respondWith(OK_STATUS, {});
    configureAuthorization({ getAccessToken: () => null, refreshAccessToken: jest.fn() });

    await api.get(PATH);

    expect(lastConfig.headers.get('Authorization')).toBeUndefined();
  });

  it('returns null for a 204, which carries no body', async () => {
    respondWith(204, '');

    await expect(api.get(PATH)).resolves.toBeNull();
  });

  it('turns the error envelope into an ApiError carrying code, details and traceId', async () => {
    respondWith(
      400,
      envelope(API_ERROR_CODES.VALIDATION_ERROR, {
        details: [{ field: 'email', code: 'invalid_format' }],
      }),
    );

    await expect(api.get(PATH)).rejects.toMatchObject({
      status: 400,
      code: API_ERROR_CODES.VALIDATION_ERROR,
      details: [{ field: 'email', code: 'invalid_format' }],
      traceId: 'trace-1',
    });
  });

  it('still throws an ApiError when the error body is not the envelope', async () => {
    respondWith(502, '<html>bad gateway</html>');

    await expect(api.get(PATH)).rejects.toMatchObject({
      status: 502,
      code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
    });
  });

  it('turns a request that never got a response into a NETWORK_ERROR ApiError', async () => {
    failWithoutResponse();

    await expect(api.get(PATH)).rejects.toMatchObject({
      status: 0,
      code: API_ERROR_CODES.NETWORK_ERROR,
    });
  });
});

describe('api.post', () => {
  it('serializes the body and sets the JSON content type', async () => {
    respondWith(OK_STATUS, {});

    await api.post(PATH, { email: 'a@b.co' });

    expect(lastConfig.method).toBe('post');
    expect(lastConfig.data).toBe(JSON.stringify({ email: 'a@b.co' }));
    expect(lastConfig.headers.get('Content-Type')).toBe('application/json');
  });

  it('posts with no body when none is given', async () => {
    respondWith(OK_STATUS, {});

    await api.post(PATH);

    expect(lastConfig.method).toBe('post');
    expect(lastConfig.data).toBeUndefined();
  });
});

describe('api.patch', () => {
  it('sends a PATCH with the given body', async () => {
    respondWith(OK_STATUS, {});

    await api.patch(PATH, { email: 'a@b.co' });

    expect(lastConfig.method).toBe('patch');
    expect(lastConfig.data).toBe(JSON.stringify({ email: 'a@b.co' }));
  });
});

describe('api.delete', () => {
  it('sends a DELETE with no body', async () => {
    respondWith(OK_STATUS, {});

    await api.delete(PATH);

    expect(lastConfig.method).toBe('delete');
    expect(lastConfig.data).toBeUndefined();
  });
});

describe('the refresh retry', () => {
  it('refreshes and repeats the request once, with the new token', async () => {
    const adapter = respondInOrder([
      { status: 401, data: envelope(API_ERROR_CODES.INVALID_ACCESS_TOKEN) },
      { status: OK_STATUS, data: { id: 'user-1' } },
    ]);
    let currentToken = TOKEN;
    const refreshAccessToken = jest.fn(async () => {
      currentToken = FRESH_TOKEN;

      return currentToken;
    });
    configureAuthorization({ getAccessToken: () => currentToken, refreshAccessToken });

    await expect(api.get(PATH)).resolves.toEqual({ id: 'user-1' });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(adapter.getCallCount()).toBe(2);
    // The repeat goes back through the request interceptor, so it carries the
    // token the refresh just produced — not the dead one it started with.
    expect(lastConfig.headers.get('Authorization')).toBe(`Bearer ${FRESH_TOKEN}`);
  });

  it('repeats at most once, instead of looping on a token the API keeps rejecting', async () => {
    const adapter = respondInOrder([
      { status: 401, data: envelope(API_ERROR_CODES.INVALID_ACCESS_TOKEN) },
    ]);
    const refreshAccessToken = jest.fn(async () => FRESH_TOKEN);
    configureAuthorization({ getAccessToken: () => TOKEN, refreshAccessToken });

    await expect(api.get(PATH)).rejects.toMatchObject({
      status: 401,
      code: API_ERROR_CODES.INVALID_ACCESS_TOKEN,
    });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(adapter.getCallCount()).toBe(2);
  });

  it('propagates the original error when the handler says the session is over', async () => {
    const adapter = respondInOrder([
      { status: 401, data: envelope(API_ERROR_CODES.INVALID_ACCESS_TOKEN) },
    ]);
    // null means the handler has already ended the session locally: there is
    // nothing for this layer to do but report why the request failed.
    const refreshAccessToken = jest.fn(async () => null);
    configureAuthorization({ getAccessToken: () => TOKEN, refreshAccessToken });

    await expect(api.get(PATH)).rejects.toMatchObject({
      status: 401,
      code: API_ERROR_CODES.INVALID_ACCESS_TOKEN,
    });
    expect(adapter.getCallCount()).toBe(1);
  });

  it('propagates the refresh failure, so being offline is not read as a dead session', async () => {
    respondInOrder([{ status: 401, data: envelope(API_ERROR_CODES.INVALID_ACCESS_TOKEN) }]);
    const refreshAccessToken = jest.fn(async () => {
      throw new ApiError({
        status: 0,
        code: API_ERROR_CODES.NETWORK_ERROR,
        message: 'The request did not reach the API.',
      });
    });
    configureAuthorization({ getAccessToken: () => TOKEN, refreshAccessToken });

    await expect(api.get(PATH)).rejects.toMatchObject({
      status: 0,
      code: API_ERROR_CODES.NETWORK_ERROR,
    });
  });

  it('does not refresh the 401 a wrong password produces', async () => {
    respondWith(401, envelope(API_ERROR_CODES.INVALID_CREDENTIALS));
    const refreshAccessToken = jest.fn(async () => FRESH_TOKEN);
    configureAuthorization({ getAccessToken: () => null, refreshAccessToken });

    await expect(api.get(PATH)).rejects.toBeInstanceOf(ApiError);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('does not refresh a 401 from the refresh endpoint itself', async () => {
    // No opt-out flag is needed anywhere: the API gives every failure its own
    // code, and only INVALID_ACCESS_TOKEN starts a refresh.
    respondWith(401, envelope(API_ERROR_CODES.INVALID_REFRESH_TOKEN));
    const refreshAccessToken = jest.fn(async () => FRESH_TOKEN);
    configureAuthorization({ getAccessToken: () => TOKEN, refreshAccessToken });

    await expect(api.post('/auth/refresh', { refreshToken: 'spent' })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('still rejects cleanly when no handlers are registered', async () => {
    respondWith(401, envelope(API_ERROR_CODES.INVALID_ACCESS_TOKEN));
    configureAuthorization(null);

    await expect(api.get(PATH)).rejects.toBeInstanceOf(ApiError);
  });
});
