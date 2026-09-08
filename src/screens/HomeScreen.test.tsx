import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useErrorToast } from '@/errors';
import { useAuth } from '@/modules/auth';

import { HomeScreen } from './HomeScreen';

jest.mock('@/modules/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/errors', () => ({ useErrorToast: jest.fn() }));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseErrorToast = useErrorToast as jest.MockedFunction<typeof useErrorToast>;

const BUTTON_ROLE = 'button';
const SIGN_OUT_LABEL = 'Sign out';
const SIGN_OUT_EVERYWHERE_LABEL = 'Sign out everywhere';
const CONFIRM_LABEL = 'Sign out';

const signOutButton = () => screen.getByRole(BUTTON_ROLE, { name: SIGN_OUT_LABEL });
const signOutEverywhereButton = () =>
  screen.getByRole(BUTTON_ROLE, { name: SIGN_OUT_EVERYWHERE_LABEL });

const givenSession = (overrides: Partial<ReturnType<typeof useAuth>> = {}) => {
  const signOut = jest.fn(async () => undefined);
  const signOutEverywhere = jest.fn(async () => undefined);

  mockUseAuth.mockReturnValue({
    status: 'signedIn',
    user: null,
    signIn: jest.fn(),
    signUp: jest.fn(),
    confirmSignUp: jest.fn(),
    changePassword: jest.fn(),
    signOut,
    signOutEverywhere,
    isSubmitting: false,
    isSigningOut: false,
    ...overrides,
  });

  return { signOut, signOutEverywhere };
};

/** Runs the destructive button of the last Alert the screen raised. */
const confirmTheAlert = async () => {
  const alertSpy = Alert.alert as jest.MockedFunction<typeof Alert.alert>;
  const [, , buttons] = alertSpy.mock.calls[0] ?? [];

  await buttons?.find((button) => button.text === CONFIRM_LABEL)?.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockUseErrorToast.mockReturnValue({ showError: jest.fn() });
});

describe('HomeScreen', () => {
  it('signs out of this device without asking', async () => {
    const { signOut } = givenSession();

    await render(<HomeScreen />);
    await fireEvent.press(signOutButton());

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('asks before ending every session, and does nothing until confirmed', async () => {
    const { signOutEverywhere } = givenSession();

    await render(<HomeScreen />);
    await fireEvent.press(signOutEverywhereButton());

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(signOutEverywhere).not.toHaveBeenCalled();

    await confirmTheAlert();

    expect(signOutEverywhere).toHaveBeenCalledTimes(1);
  });

  it('shows the failure of signing out everywhere, which keeps the session', async () => {
    const showError = jest.fn();
    mockUseErrorToast.mockReturnValue({ showError });
    const failure = new Error('offline');
    givenSession({ signOutEverywhere: jest.fn(async () => Promise.reject(failure)) });

    await render(<HomeScreen />);
    await fireEvent.press(signOutEverywhereButton());
    await confirmTheAlert();

    // `onPress` returns void, so awaiting it does not await the promise chain
    // behind it: the rejection reaches `.catch` a microtask later.
    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(failure);
    });
  });

  it('disables both buttons while a sign-out is in flight', async () => {
    givenSession({ isSigningOut: true });

    await render(<HomeScreen />);

    expect(signOutButton()).toBeDisabled();
    expect(signOutEverywhereButton()).toBeDisabled();
  });
});
