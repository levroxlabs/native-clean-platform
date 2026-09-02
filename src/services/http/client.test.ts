import { ApiError } from './ApiError';
import { configureAuthorization, request } from './client';
import { API_ERROR_CODES } from './errorCodes';
import { HTTP_METHODS } from './types';

const BASE_URL = 'http://localhost:3000';
const PATH = '/auth/me';
const TOKEN = 'a-token';

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const envelope = (code: string, extra: Record<string, unknown> = {}) => ({
  error: { code, message: 'human readable', traceId: 'trace-1', ...extra },
});

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  configureAuthorization(null);
});

describe('request', () => {
  it('prefixes the base URL and returns the parsed body', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { id: 'user-1' }));

    await expect(request(PATH)).resolves.toEqual({ id: 'user-1' });
    expect(mockFetch).toHaveBeenCalledWith(`${BASE_URL}${PATH}`, expect.anything());
  });

  it('serializes the body and sets the JSON content type on a POST', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, {}));

    await request(PATH, { method: HTTP_METHODS.POST, body: { email: 'a@b.co' } });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.co' }));
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('attaches the bearer token when a provider returns one', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, {}));
    configureAuthorization({ getAccessToken: () => TOKEN, onUnauthorized: jest.fn() });

    await request(PATH);

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('omits the header when there is no token', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, {}));
    configureAuthorization({ getAccessToken: () => null, onUnauthorized: jest.fn() });

    await request(PATH);

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('turns the error envelope into an ApiError carrying code, details and traceId', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(
        400,
        envelope(API_ERROR_CODES.VALIDATION_ERROR, {
          details: [{ field: 'email', code: 'invalid_format' }],
        }),
      ),
    );

    await expect(request(PATH)).rejects.toMatchObject({
      status: 400,
      code: API_ERROR_CODES.VALIDATION_ERROR,
      details: [{ field: 'email', code: 'invalid_format' }],
      traceId: 'trace-1',
    });
  });

  it('still throws an ApiError when the error body is not the envelope', async () => {
    mockFetch.mockResolvedValue(jsonResponse(502, '<html>bad gateway</html>'));

    await expect(request(PATH)).rejects.toMatchObject({
      status: 502,
      code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
    });
  });

  it('ends the session on a 401 caused by the access token', async () => {
    const onUnauthorized = jest.fn();
    mockFetch.mockResolvedValue(jsonResponse(401, envelope(API_ERROR_CODES.INVALID_ACCESS_TOKEN)));
    configureAuthorization({ getAccessToken: () => TOKEN, onUnauthorized });

    await expect(request(PATH)).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does NOT end the session on the 401 a wrong password produces', async () => {
    const onUnauthorized = jest.fn();
    mockFetch.mockResolvedValue(jsonResponse(401, envelope(API_ERROR_CODES.INVALID_CREDENTIALS)));
    configureAuthorization({ getAccessToken: () => null, onUnauthorized });

    await expect(request(PATH)).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('turns a failed fetch into a NETWORK_ERROR ApiError', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    await expect(request(PATH)).rejects.toMatchObject({
      code: API_ERROR_CODES.NETWORK_ERROR,
    });
  });
});
