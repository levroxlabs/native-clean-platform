import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useErrorToast } from '@/errors';

import { useAuth } from '../hooks/useAuth';
import { AccountScreen } from './AccountScreen';

jest.mock('../hooks/useAuth');
jest.mock('@/errors', () => ({ useErrorToast: jest.fn() }));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseErrorToast = useErrorToast as jest.MockedFunction<typeof useErrorToast>;

const BUTTON_ROLE = 'button';
const VALID_EMAIL = 'user@example.com';
const CHANGE_PASSWORD_LABEL = 'Change password';
const SIGN_OUT_LABEL = 'Sign out';
const SIGN_OUT_EVERYWHERE_LABEL = 'Sign out everywhere';
/** The Alert's destructive button carries the same label as the plain sign-out one. */
const CONFIRM_LABEL = 'Sign out';

const PROFILE = {
  id: '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21',
  email: VALID_EMAIL,
  emailVerifiedAt: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};

const navigation = { navigate: jest.fn() };
const mockSignOut = jest.fn(async () => undefined);
const mockSignOutEverywhere = jest.fn(async () => undefined);

const changePasswordButton = () => screen.getByRole(BUTTON_ROLE, { name: CHANGE_PASSWORD_LABEL });
const signOutButton = () => screen.getByRole(BUTTON_ROLE, { name: SIGN_OUT_LABEL });
const signOutEverywhereButton = () =>
  screen.getByRole(BUTTON_ROLE, { name: SIGN_OUT_EVERYWHERE_LABEL });

/** Runs the destructive button of the last Alert the screen raised. */
const confirmTheAlert = async () => {
  const alertSpy = Alert.alert as jest.MockedFunction<typeof Alert.alert>;
  const [, , buttons] = alertSpy.mock.calls[0] ?? [];

  await buttons?.find((button) => button.text === CONFIRM_LABEL)?.onPress?.();
};

const givenSession = (overrides: Partial<ReturnType<typeof useAuth>> = {}) => {
  mockUseAuth.mockReturnValue({
    status: 'signedIn',
    user: PROFILE,
    signIn: jest.fn(),
    confirmSignUp: jest.fn(),
    changePassword: jest.fn(),
    signOut: mockSignOut,
    signOutEverywhere: mockSignOutEverywhere,
    isSubmitting: false,
    isSigningOut: false,
    ...overrides,
  });
};

const renderScreen = async () =>
  render(
    <AccountScreen
      navigation={navigation as never}
      route={{ key: 'k', name: 'Account' } as never}
    />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockUseErrorToast.mockReturnValue({ showError: jest.fn() });
  givenSession();
});

describe('AccountScreen', () => {
  it('shows the address of the signed-in account', async () => {
    await renderScreen();

    expect(screen.getByText(VALID_EMAIL)).toBeTruthy();
  });

  it('opens the password screen', async () => {
    await renderScreen();
    await fireEvent.press(changePasswordButton());

    expect(navigation.navigate).toHaveBeenCalledWith('ChangePassword');
  });

  it('signs out on this device without asking', async () => {
    await renderScreen();
    await fireEvent.press(signOutButton());

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('asks before ending every session, and does nothing until confirmed', async () => {
    await renderScreen();
    await fireEvent.press(signOutEverywhereButton());

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(mockSignOutEverywhere).not.toHaveBeenCalled();

    await confirmTheAlert();

    expect(mockSignOutEverywhere).toHaveBeenCalledTimes(1);
  });

  it('shows the failure of signing out everywhere, which keeps the session', async () => {
    const showError = jest.fn();
    const failure = new Error('offline');
    mockUseErrorToast.mockReturnValue({ showError });
    givenSession({ signOutEverywhere: jest.fn(async () => Promise.reject(failure)) });

    await renderScreen();
    await fireEvent.press(signOutEverywhereButton());
    await confirmTheAlert();

    // `onPress` returns void, so awaiting it does not await the promise chain
    // behind it: the rejection reaches `.catch` a microtask later.
    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(failure);
    });
  });

  it('disables every action while a sign-out is in flight', async () => {
    givenSession({ isSigningOut: true });

    await renderScreen();

    expect(changePasswordButton()).toBeDisabled();
    expect(signOutButton()).toBeDisabled();
    expect(signOutEverywhereButton()).toBeDisabled();
  });
});
