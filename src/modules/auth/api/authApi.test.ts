import { api } from '@/lib';

import {
  changePassword,
  confirmSignUp,
  fetchMe,
  login,
  logout,
  logoutEverywhere,
  refreshSession,
  requestPasswordReset,
  resendVerificationCode,
  resetPassword,
  startSignUp,
} from './authApi';

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
const VERIFICATION_CODE = '042317';
const RESET_TOKEN = 'Yk9wYVF1ZVRva2VuRXhhbXBsZVZhbHVlMTIzNDU2Nzg5';
const NEW_PASSWORD = 'ev3nS4fer!';
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

describe('login', () => {
  it('asks for body transport and returns both tokens', async () => {
    mockApi.post.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
    });

    await expect(login(CREDENTIALS)).resolves.toEqual({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
    });
    // Stated rather than inherited from the server default: this client depends
    // on the refresh token being in the body, so it says so.
    expect(mockApi.post).toHaveBeenCalledWith('/auth/login', {
      ...CREDENTIALS,
      refreshTransport: 'body',
    });
  });

  it('rejects an answer with no refresh token as a contract drift', async () => {
    mockApi.post.mockResolvedValue({ accessToken: ACCESS_TOKEN });

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

describe('startSignUp', () => {
  it('sends the email alone, because the API body is strict', async () => {
    mockApi.post.mockResolvedValue(null);

    await expect(startSignUp(CREDENTIALS.email)).resolves.toBeUndefined();
    // A stale `password` here is a 400, not a silently dropped field: the API
    // schema is `.strict()`. The assertion is the contract.
    expect(mockApi.post).toHaveBeenCalledWith('/auth/register', { email: CREDENTIALS.email });
  });
});

describe('resendVerificationCode', () => {
  it('sends the email and parses nothing, since 202 has no body', async () => {
    mockApi.post.mockResolvedValue(null);

    await expect(resendVerificationCode(CREDENTIALS.email)).resolves.toBeUndefined();
    expect(mockApi.post).toHaveBeenCalledWith('/auth/email/verify/resend', {
      email: CREDENTIALS.email,
    });
  });
});

describe('confirmSignUp', () => {
  const input = {
    email: CREDENTIALS.email,
    code: VERIFICATION_CODE,
    password: CREDENTIALS.password,
  };

  it('asks for body transport and returns both tokens', async () => {
    mockApi.post.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
    });

    await expect(confirmSignUp(input)).resolves.toEqual({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
    });
    expect(mockApi.post).toHaveBeenCalledWith('/auth/email/verify', {
      ...input,
      refreshTransport: 'body',
    });
  });

  it('rejects an answer with no refresh token as a contract drift', async () => {
    mockApi.post.mockResolvedValue({ accessToken: ACCESS_TOKEN });

    await expect(confirmSignUp(input)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});

describe('requestPasswordReset', () => {
  it('sends the email alone, because the API body is strict', async () => {
    mockApi.post.mockResolvedValue(null);

    await expect(requestPasswordReset(CREDENTIALS.email)).resolves.toBeUndefined();
    expect(mockApi.post).toHaveBeenCalledWith('/auth/password/forgot', {
      email: CREDENTIALS.email,
    });
  });
});

describe('resetPassword', () => {
  it('sends the token and the new password, and nothing else', async () => {
    mockApi.post.mockResolvedValue(null);

    await expect(
      resetPassword({ token: RESET_TOKEN, newPassword: NEW_PASSWORD }),
    ).resolves.toBeUndefined();
    // No email: the API body is `{ token, newPassword }` and `.strict()`.
    expect(mockApi.post).toHaveBeenCalledWith('/auth/password/reset', {
      token: RESET_TOKEN,
      newPassword: NEW_PASSWORD,
    });
  });
});

describe('changePassword', () => {
  it('asks for body transport and returns the replacement pair', async () => {
    mockApi.post.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: ROTATED_REFRESH_TOKEN,
    });

    await expect(
      changePassword({ currentPassword: CREDENTIALS.password, newPassword: NEW_PASSWORD }),
    ).resolves.toEqual({ accessToken: ACCESS_TOKEN, refreshToken: ROTATED_REFRESH_TOKEN });
    expect(mockApi.post).toHaveBeenCalledWith('/auth/password', {
      currentPassword: CREDENTIALS.password,
      newPassword: NEW_PASSWORD,
      refreshTransport: 'body',
    });
  });
});
