import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type Metrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorToastProvider } from '@/errors';

import { useAuth } from '../hooks/useAuth';
import { AccountStack } from './AccountStack';

/**
 * The deep path, not the barrel: `AccountScreen` and `ChangePasswordScreen`
 * import `../hooks/useAuth` directly, so mocking `@/modules/auth` would leave
 * the real hook running and throw for a missing provider.
 */
jest.mock('../hooks/useAuth');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const VALID_EMAIL = 'user@example.com';
const CHANGE_PASSWORD_LABEL = 'Change password';

const PROFILE = {
  id: '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21',
  email: VALID_EMAIL,
  emailVerifiedAt: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};

/** `initialMetrics` skips the native measurement, which never resolves under Jest. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * `ChangePasswordScreen` reaches for the toast in its catch branch, and the
 * toast in turn needs the safe area — same wrapping as `App.tsx`.
 */
const renderStack = async () =>
  render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ErrorToastProvider>
        <NavigationContainer>
          <AccountStack />
        </NavigationContainer>
      </ErrorToastProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    status: 'signedIn',
    user: PROFILE,
    signIn: jest.fn(),
    confirmSignUp: jest.fn(),
    changePassword: jest.fn(),
    signOut: jest.fn(),
    signOutEverywhere: jest.fn(),
    isSubmitting: false,
    isSigningOut: false,
  });
});

describe('AccountStack', () => {
  it('starts on the account screen', async () => {
    await renderStack();

    expect(screen.getByText('Signed in as')).toBeTruthy();
    expect(screen.getByText(VALID_EMAIL)).toBeTruthy();
  });

  it('navigates to the change password screen on "Change password"', async () => {
    await renderStack();

    await fireEvent.press(screen.getByRole('button', { name: CHANGE_PASSWORD_LABEL }));

    expect(await screen.findByText('Change your password')).toBeTruthy();
  });
});
