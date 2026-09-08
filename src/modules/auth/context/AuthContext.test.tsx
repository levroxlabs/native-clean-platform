import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { API_ERROR_CODES, ApiError } from '@/lib';
import {
  changePassword,
  confirmSignUp,
  fetchMe,
  login,
  logout,
  logoutEverywhere,
  refreshSession,
  register,
} from '../api/authApi';
import { useAuth } from '../hooks/useAuth';
import { clearRefreshToken, readRefreshToken, writeRefreshToken } from '../storage';
import { AuthProvider } from './AuthContext';

jest.mock('../api/authApi');

const mockFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;
const mockLogin = login as jest.MockedFunction<typeof login>;
const mockLogout = logout as jest.MockedFunction<typeof logout>;
const mockLogoutEverywhere = logoutEverywhere as jest.MockedFunction<typeof logoutEverywhere>;
const mockRefreshSession = refreshSession as jest.MockedFunction<typeof refreshSession>;
const mockRegister = register as jest.MockedFunction<typeof register>;
const mockConfirmSignUp = confirmSignUp as jest.MockedFunction<typeof confirmSignUp>;
const mockChangePassword = changePassword as jest.MockedFunction<typeof changePassword>;

const ACCESS_TOKEN = 'a-signed-token';
const REFRESH_TOKEN = 'a-refresh-token';
const ROTATED_REFRESH_TOKEN = 'the-next-refresh-token';
const REPLACEMENT_REFRESH_TOKEN = 'the-refresh-token-the-password-change-issued';
const CONFIRMATION = {
  email: 'user@example.com',
  code: '042317',
  password: 'sup3rS3cret!',
  confirmPassword: 'sup3rS3cret!',
};
const PASSWORD_CHANGE = {
  currentPassword: 'sup3rS3cret!',
  newPassword: 'ev3nS4fer!',
  confirmPassword: 'ev3nS4fer!',
};
const CREDENTIALS = { email: 'user@example.com', password: 'sup3rS3cret!' };
const PROFILE = {
  id: '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21',
  email: CREDENTIALS.email,
  emailVerifiedAt: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};

const SIGN_IN_LABEL = 'probe-sign-in';
const SIGN_UP_LABEL = 'probe-sign-up';
const CONFIRM_SIGN_UP_LABEL = 'probe-confirm-sign-up';
const CHANGE_PASSWORD_LABEL = 'probe-change-password';
const SIGN_OUT_LABEL = 'probe-sign-out';
const SIGN_OUT_EVERYWHERE_LABEL = 'probe-sign-out-everywhere';

const networkFailure = () =>
  new ApiError({
    status: 0,
    code: API_ERROR_CODES.NETWORK_ERROR,
    message: 'The request did not reach the API.',
  });

const rotatedPair = { accessToken: ACCESS_TOKEN, refreshToken: ROTATED_REFRESH_TOKEN };

const Probe = () => {
  const {
    status,
    user,
    signIn,
    signUp,
    confirmSignUp: confirmSignUpAction,
    changePassword: changePasswordAction,
    signOut,
    signOutEverywhere,
  } = useAuth();

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
          void confirmSignUpAction(CONFIRMATION).catch(() => undefined);
        }}
      >
        <Text>{CONFIRM_SIGN_UP_LABEL}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void changePasswordAction(PASSWORD_CHANGE).catch(() => undefined);
        }}
      >
        <Text>{CHANGE_PASSWORD_LABEL}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void signOut();
        }}
      >
        <Text>{SIGN_OUT_LABEL}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void signOutEverywhere().catch(() => undefined);
        }}
      >
        <Text>{SIGN_OUT_EVERYWHERE_LABEL}</Text>
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

  it('confirms the sign-up, which creates the account and opens the session', async () => {
    mockConfirmSignUp.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
    });
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();
    await screen.findByText('status:signedOut');
    await fireEvent.press(screen.getByText(CONFIRM_SIGN_UP_LABEL));

    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    // The client-only confirmation field is not forwarded: the API body has no
    // place for it.
    expect(mockConfirmSignUp).toHaveBeenCalledWith({
      email: CONFIRMATION.email,
      code: CONFIRMATION.code,
      password: CONFIRMATION.password,
    });
    // This call creates the account, so nothing logs in afterwards.
    expect(mockLogin).not.toHaveBeenCalled();
    await expect(readRefreshToken()).resolves.toBe(REFRESH_TOKEN);
  });

  const givenSignedIn = async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockResolvedValue(rotatedPair);
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();
    await screen.findByText('status:signedIn');
  };

  it('persists the replacement refresh token when the password changes', async () => {
    mockChangePassword.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: REPLACEMENT_REFRESH_TOKEN,
    });
    await givenSignedIn();

    await fireEvent.press(screen.getByText(CHANGE_PASSWORD_LABEL));

    // The API revoked every other session and handed this device a new pair.
    // Not writing it would sign this device out at the next refresh.
    await waitFor(async () => {
      await expect(readRefreshToken()).resolves.toBe(REPLACEMENT_REFRESH_TOKEN);
    });
    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    expect(mockChangePassword).toHaveBeenCalledWith({
      currentPassword: PASSWORD_CHANGE.currentPassword,
      newPassword: PASSWORD_CHANGE.newPassword,
    });
  });

  it('keeps the session and the stored token when the password change is refused', async () => {
    mockChangePassword.mockRejectedValue(
      new ApiError({
        status: 422,
        code: API_ERROR_CODES.INVALID_CURRENT_PASSWORD,
        message: 'never rendered',
      }),
    );
    await givenSignedIn();

    await fireEvent.press(screen.getByText(CHANGE_PASSWORD_LABEL));

    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    await expect(readRefreshToken()).resolves.toBe(ROTATED_REFRESH_TOKEN);
  });

  it('signs out, revoking this device session on the server', async () => {
    mockLogout.mockResolvedValue(undefined);
    await givenSignedIn();

    await fireEvent.press(screen.getByText(SIGN_OUT_LABEL));

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    expect(await screen.findByText('user:none')).toBeTruthy();
    // The token the rotation left behind, not the one boot started with.
    expect(mockLogout).toHaveBeenCalledWith(ROTATED_REFRESH_TOKEN);
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  it('still signs out locally when the logout call fails', async () => {
    mockLogout.mockRejectedValue(networkFailure());
    await givenSignedIn();

    await fireEvent.press(screen.getByText(SIGN_OUT_LABEL));

    // Trapping a user in a signed-in app because the device is offline is worse
    // than a refresh token that stays live until it expires — and the local
    // clear removes the only copy of it anyway.
    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  it('signs out everywhere, ending the local session too', async () => {
    mockLogoutEverywhere.mockResolvedValue(undefined);
    await givenSignedIn();

    await fireEvent.press(screen.getByText(SIGN_OUT_EVERYWHERE_LABEL));

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    expect(mockLogoutEverywhere).toHaveBeenCalledTimes(1);
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  it('keeps the session when signing out everywhere fails', async () => {
    mockLogoutEverywhere.mockRejectedValue(networkFailure());
    await givenSignedIn();

    await fireEvent.press(screen.getByText(SIGN_OUT_EVERYWHERE_LABEL));

    // The promise is EVERY device. Degrading to a local sign-out would tell the
    // user their other sessions ended when they did not.
    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    await expect(readRefreshToken()).resolves.toBe(ROTATED_REFRESH_TOKEN);
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
