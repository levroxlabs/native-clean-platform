import { API_ERROR_CODES, HTTP_METHODS, request } from '@/lib';

import { fetchMe, login, register } from './authApi';

jest.mock('@/lib', () => ({
  ...jest.requireActual('@/lib'),
  request: jest.fn(),
}));

const mockRequest = request as jest.MockedFunction<typeof request>;

const CREDENTIALS = { email: 'user@example.com', password: 'sup3rS3cret!' };
const USER_ID = '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21';
const PROFILE = {
  id: USER_ID,
  email: CREDENTIALS.email,
  emailVerifiedAt: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};

beforeEach(() => {
  mockRequest.mockReset();
});

describe('register', () => {
  it('posts the credentials and returns the new user id', async () => {
    mockRequest.mockResolvedValue({ id: USER_ID });

    await expect(register(CREDENTIALS)).resolves.toBe(USER_ID);
    expect(mockRequest).toHaveBeenCalledWith('/auth/register', {
      method: HTTP_METHODS.POST,
      body: CREDENTIALS,
    });
  });
});

describe('login', () => {
  it('posts the credentials and returns the access token', async () => {
    mockRequest.mockResolvedValue({ accessToken: 'a-signed-token' });

    await expect(login(CREDENTIALS)).resolves.toBe('a-signed-token');
    expect(mockRequest).toHaveBeenCalledWith('/auth/login', {
      method: HTTP_METHODS.POST,
      body: CREDENTIALS,
    });
  });

  it('rejects an empty access token as a contract drift', async () => {
    mockRequest.mockResolvedValue({ accessToken: '' });

    await expect(login(CREDENTIALS)).rejects.toMatchObject({
      code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
    });
  });
});

describe('fetchMe', () => {
  it('gets the profile and parses it', async () => {
    mockRequest.mockResolvedValue(PROFILE);

    await expect(fetchMe()).resolves.toEqual(PROFILE);
    expect(mockRequest).toHaveBeenCalledWith('/auth/me');
  });

  it('throws an ApiError when the API drifts from the agreed shape', async () => {
    mockRequest.mockResolvedValue({ ...PROFILE, id: 'not-a-uuid' });

    await expect(fetchMe()).rejects.toMatchObject({
      code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
    });
  });
});
