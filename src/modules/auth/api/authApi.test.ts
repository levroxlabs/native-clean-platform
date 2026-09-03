import { api } from '@/lib';

import { fetchMe, login, logout, logoutEverywhere, refreshSession, register } from './authApi';

jest.mock('@/lib', () => ({
  ...jest.requireActual('@/lib'),
  api: { get: jest.fn(), post: jest.fn() },
}));

const mockApi = api as jest.Mocked<typeof api>;

const CREDENTIALS = { email: 'user@example.com', password: 'sup3rS3cret!' };
const USER_ID = '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21';
const ACCESS_TOKEN = 'an-access-token';
const REFRESH_TOKEN = 'a-refresh-token';
const ROTATED_REFRESH_TOKEN = 'the-next-refresh-token';
const PROFILE = {
  id: USER_ID,
  email: CREDENTIALS.email,
  emailVerifiedAt: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset();
});

describe('register', () => {
  it('posts the credentials and returns the new user id', async () => {
    mockApi.post.mockResolvedValue({ id: USER_ID });

    await expect(register(CREDENTIALS)).resolves.toBe(USER_ID);
    expect(mockApi.post).toHaveBeenCalledWith('/auth/register', CREDENTIALS);
  });
});

describe('login', () => {
  it('posts the credentials and returns the access token', async () => {
    mockApi.post.mockResolvedValue({ accessToken: 'a-signed-token' });

    await expect(login(CREDENTIALS)).resolves.toBe('a-signed-token');
    expect(mockApi.post).toHaveBeenCalledWith('/auth/login', CREDENTIALS);
  });

  it('rejects an empty access token as a contract drift', async () => {
    mockApi.post.mockResolvedValue({ accessToken: '' });

    await expect(login(CREDENTIALS)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});

describe('fetchMe', () => {
  it('gets the profile and parses it', async () => {
    mockApi.get.mockResolvedValue(PROFILE);

    await expect(fetchMe()).resolves.toEqual(PROFILE);
    expect(mockApi.get).toHaveBeenCalledWith('/auth/me');
  });

  it('throws an ApiError when the API drifts from the agreed shape', async () => {
    mockApi.get.mockResolvedValue({ ...PROFILE, id: 'not-a-uuid' });

    await expect(fetchMe()).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});

describe('refreshSession', () => {
  it('posts the stored token and returns the rotated pair', async () => {
    mockApi.post.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: ROTATED_REFRESH_TOKEN,
    });

    await expect(refreshSession(REFRESH_TOKEN)).resolves.toEqual({
      accessToken: ACCESS_TOKEN,
      refreshToken: ROTATED_REFRESH_TOKEN,
    });
    expect(mockApi.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: REFRESH_TOKEN });
  });

  it('rejects an answer with no refresh token as a contract drift', async () => {
    mockApi.post.mockResolvedValue({ accessToken: ACCESS_TOKEN });

    await expect(refreshSession(REFRESH_TOKEN)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});

describe('logout', () => {
  it('posts the refresh token and parses nothing, since the API answers 204', async () => {
    mockApi.post.mockResolvedValue(null);

    await expect(logout(REFRESH_TOKEN)).resolves.toBeUndefined();
    expect(mockApi.post).toHaveBeenCalledWith('/auth/logout', { refreshToken: REFRESH_TOKEN });
  });
});

describe('logoutEverywhere', () => {
  it('posts with no body, since the API takes the user from the bearer token', async () => {
    // Deliberate: sending a userId here would let any authenticated caller sign
    // anyone out, so the API reads it from the verified token subject only.
    mockApi.post.mockResolvedValue(null);

    await expect(logoutEverywhere()).resolves.toBeUndefined();
    expect(mockApi.post).toHaveBeenCalledWith('/auth/logout-all');
  });
});
