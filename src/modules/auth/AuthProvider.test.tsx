import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { API_ERROR_CODES, ApiError } from '@/services/http';
import { AuthProvider } from './AuthProvider';
import { fetchMe, login, register } from './api/authApi';
import { useAuth } from './hooks/useAuth';
import { clearAccessToken, readAccessToken, writeAccessToken } from './storage';

jest.mock('./api/authApi');

const mockFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;
const mockLogin = login as jest.MockedFunction<typeof login>;
const mockRegister = register as jest.MockedFunction<typeof register>;

const TOKEN = 'a-signed-token';
const CREDENTIALS = { email: 'user@example.com', password: 'sup3rS3cret!' };
const PROFILE = {
  id: '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21',
  email: CREDENTIALS.email,
  emailVerifiedAt: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};

const SIGN_IN_LABEL = 'probe-sign-in';
const SIGN_UP_LABEL = 'probe-sign-up';
const SIGN_OUT_LABEL = 'probe-sign-out';

const Probe = () => {
  const { status, user, signIn, signUp, signOut } = useAuth();

  return (
    <>
      <Text>{`status:${status}`}</Text>
      <Text>{`user:${user?.email ?? 'none'}`}</Text>
      <Pressable
        onPress={() => {
          void signIn(CREDENTIALS).catch(() => undefined);
        }}
      >
        <Text>{SIGN_IN_LABEL}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void signUp(CREDENTIALS).catch(() => undefined);
        }}
      >
        <Text>{SIGN_UP_LABEL}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void signOut();
        }}
      >
        <Text>{SIGN_OUT_LABEL}</Text>
      </Pressable>
    </>
  );
};

const renderAuth = async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
};

beforeEach(async () => {
  jest.clearAllMocks();
  await clearAccessToken();
});

describe('AuthProvider', () => {
  it('boots signed out when the keychain is empty', async () => {
    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    expect(mockFetchMe).not.toHaveBeenCalled();
  });

  it('restores the session when the stored token still verifies', async () => {
    await writeAccessToken(TOKEN);
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();

    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    expect(await screen.findByText(`user:${PROFILE.email}`)).toBeTruthy();
  });

  it('clears a stored token the API rejects', async () => {
    await writeAccessToken(TOKEN);
    mockFetchMe.mockRejectedValue(
      new ApiError({
        status: 401,
        code: API_ERROR_CODES.INVALID_ACCESS_TOKEN,
        message: 'Invalid or expired access token',
      }),
    );

    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    await expect(readAccessToken()).resolves.toBeNull();
  });

  it('keeps the stored token when /auth/me fails for a network reason', async () => {
    await writeAccessToken(TOKEN);
    mockFetchMe.mockRejectedValue(
      new ApiError({
        status: 0,
        code: API_ERROR_CODES.NETWORK_ERROR,
        message: 'The request did not reach the API.',
      }),
    );

    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    // Being offline is not a reason to make the user type their password again
    // on the next launch.
    await expect(readAccessToken()).resolves.toBe(TOKEN);
  });

  it('signs in, stores the token and exposes the user', async () => {
    mockLogin.mockResolvedValue(TOKEN);
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();
    await screen.findByText('status:signedOut');
    await fireEvent.press(screen.getByText(SIGN_IN_LABEL));

    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    await expect(readAccessToken()).resolves.toBe(TOKEN);
  });

  it('signs up by registering and then logging in, because register issues no session', async () => {
    mockRegister.mockResolvedValue(PROFILE.id);
    mockLogin.mockResolvedValue(TOKEN);
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();
    await screen.findByText('status:signedOut');
    await fireEvent.press(screen.getByText(SIGN_UP_LABEL));

    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    expect(mockRegister).toHaveBeenCalledWith(CREDENTIALS);
    expect(mockLogin).toHaveBeenCalledWith(CREDENTIALS);
  });

  it('signs out, clearing both the keychain and the user', async () => {
    await writeAccessToken(TOKEN);
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();
    await screen.findByText('status:signedIn');
    await fireEvent.press(screen.getByText(SIGN_OUT_LABEL));

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    expect(await screen.findByText('user:none')).toBeTruthy();
    await expect(readAccessToken()).resolves.toBeNull();
  });
});
