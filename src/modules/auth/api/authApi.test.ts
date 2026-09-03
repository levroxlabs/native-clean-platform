import { api } from '@/lib';

import { fetchMe, login, register } from './authApi';

jest.mock('@/lib', () => ({
  ...jest.requireActual('@/lib'),
  api: { get: jest.fn(), post: jest.fn() },
}));

const mockApi = api as jest.Mocked<typeof api>;

const CREDENTIALS = { email: 'user@example.com', password: 'sup3rS3cret!' };
const USER_ID = '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21';
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
