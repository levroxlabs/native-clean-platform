import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { API_ERROR_CODES, ApiError } from '@/lib';
import { fetchMe, login, refreshSession, register } from '../api/authApi';
import { useAuth } from '../hooks/useAuth';
import { clearRefreshToken, readRefreshToken, writeRefreshToken } from '../storage';
import { AuthProvider } from './AuthContext';

jest.mock('../api/authApi');

const mockFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;
const mockLogin = login as jest.MockedFunction<typeof login>;
const mockRefreshSession = refreshSession as jest.MockedFunction<typeof refreshSession>;
const mockRegister = register as jest.MockedFunction<typeof register>;

const ACCESS_TOKEN = 'a-signed-token';
const REFRESH_TOKEN = 'a-refresh-token';
const ROTATED_REFRESH_TOKEN = 'the-next-refresh-token';
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

const networkFailure = () =>
  new ApiError({
    status: 0,
    code: API_ERROR_CODES.NETWORK_ERROR,
    message: 'The request did not reach the API.',
  });

const rotatedPair = { accessToken: ACCESS_TOKEN, refreshToken: ROTATED_REFRESH_TOKEN };

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
  await clearRefreshToken();
});

describe('AuthProvider', () => {
  it('boots signed out when secure storage is empty', async () => {
    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    expect(mockRefreshSession).not.toHaveBeenCalled();
    expect(mockFetchMe).not.toHaveBeenCalled();
  });

  it('restores the session by spending the stored refresh token', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockResolvedValue(rotatedPair);
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();

    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    expect(await screen.findByText(`user:${PROFILE.email}`)).toBeTruthy();
    expect(mockRefreshSession).toHaveBeenCalledWith(REFRESH_TOKEN);
    // The rotation is persisted: the token that was spent must not survive a
    // relaunch, or the next boot trips the API's reuse detection.
    await expect(readRefreshToken()).resolves.toBe(ROTATED_REFRESH_TOKEN);
  });

  it('clears storage when the API rejects the stored refresh token', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockRejectedValue(
      new ApiError({
        status: 401,
        code: API_ERROR_CODES.INVALID_REFRESH_TOKEN,
        message: 'Invalid or expired refresh token',
      }),
    );

    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    await expect(readRefreshToken()).resolves.toBeNull();
    expect(mockFetchMe).not.toHaveBeenCalled();
  });

  it('clears storage when a spent refresh token is reused', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockRejectedValue(
      new ApiError({
        status: 401,
        code: API_ERROR_CODES.REFRESH_TOKEN_REUSED,
        message: 'Refresh token was already used',
      }),
    );

    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  it('keeps the stored refresh token when the refresh fails for a network reason', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockRejectedValue(networkFailure());

    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    // Being offline is not a reason to make the user type their password again
    // on the next launch.
    await expect(readRefreshToken()).resolves.toBe(REFRESH_TOKEN);
  });

  it('signs in, storing the refresh token and exposing the user', async () => {
    mockLogin.mockResolvedValue({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN });
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();
    await screen.findByText('status:signedOut');
    await fireEvent.press(screen.getByText(SIGN_IN_LABEL));

    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    await expect(readRefreshToken()).resolves.toBe(REFRESH_TOKEN);
  });

  it('signs up by registering and then logging in, because register issues no session', async () => {
    mockRegister.mockResolvedValue(PROFILE.id);
    mockLogin.mockResolvedValue({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN });
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();
    await screen.findByText('status:signedOut');
    await fireEvent.press(screen.getByText(SIGN_UP_LABEL));

    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    expect(mockRegister).toHaveBeenCalledWith(CREDENTIALS);
    expect(mockLogin).toHaveBeenCalledWith(CREDENTIALS);
  });

  it('signs out, clearing both storage and the user', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockResolvedValue(rotatedPair);
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();
    await screen.findByText('status:signedIn');
    await fireEvent.press(screen.getByText(SIGN_OUT_LABEL));

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    expect(await screen.findByText('user:none')).toBeTruthy();
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  describe('while the connectivity watcher reports the device offline', () => {
    // startConnectivityWatch (src/lib/connectivity.ts) feeds this same
    // onlineManager, so this is what a real airplane-mode boot looks like to
    // TanStack Query — not a mocked axios failure.
    afterEach(() => {
      onlineManager.setOnline(true);
    });

    it('still boots to signedOut instead of hanging on the splash screen', async () => {
      onlineManager.setOnline(false);
      await writeRefreshToken(REFRESH_TOKEN);
      mockRefreshSession.mockResolvedValue(rotatedPair);
      mockFetchMe.mockRejectedValue(networkFailure());

      await renderAuth();

      // The default networkMode pauses a query while onlineManager reports
      // offline, and a paused query never reaches isSuccess or isError — the
      // boot gate would wait for either forever. This assertion times out on
      // that bug rather than failing fast.
      expect(await screen.findByText('status:signedOut')).toBeTruthy();
      expect(mockFetchMe).toHaveBeenCalled();
    });

    it('still lets the user sign in instead of leaving the submit stuck forever', async () => {
      onlineManager.setOnline(false);
      mockLogin.mockResolvedValue({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN });
      mockFetchMe.mockResolvedValue(PROFILE);

      await renderAuth();
      await screen.findByText('status:signedOut');
      await fireEvent.press(screen.getByText(SIGN_IN_LABEL));

      // Same trap on the mutation side: the default networkMode pauses it
      // offline, so mutationFn is never called and mutateAsync never settles.
      expect(await screen.findByText('status:signedIn')).toBeTruthy();
      expect(mockLogin).toHaveBeenCalledWith(CREDENTIALS);
    });
  });
});
