import { render, screen } from '@testing-library/react-native';

import { type Metrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorToastProvider } from '@/errors';
import { AUTH_STATUSES } from '@/modules/auth';
import { useAuth } from '@/modules/auth/hooks/useAuth';

import { RootNavigator } from './RootNavigator';

/**
 * The deep path, not the barrel: the screens import `../hooks/useAuth`
 * directly, so mocking `@/modules/auth` would leave the real hook running
 * inside `SignInScreen` and throw for a missing provider. Mocking the file
 * itself covers both importers, since the barrel re-exports this same module.
 */
jest.mock('@/modules/auth/hooks/useAuth');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const sessionWith = (status: string) =>
  ({
    status,
    user: null,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    signOutEverywhere: jest.fn(),
    isSubmitting: false,
    isSigningOut: false,
  }) as never;

/** `initialMetrics` skips the native measurement, which never resolves under Jest. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * The two providers mirror `App.tsx`, which mounts both above `RootNavigator`.
 * This test renders the real screens, so it has to render the environment they
 * need: `HomeScreen` reaches for the toast to report a failed "sign out
 * everywhere", and the toast in turn needs the safe area.
 */
const renderNavigator = async () =>
  render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ErrorToastProvider>
        <RootNavigator />
      </ErrorToastProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RootNavigator', () => {
  it('shows neither stack while the session is still unknown', async () => {
    mockUseAuth.mockReturnValue(sessionWith(AUTH_STATUSES.LOADING));

    await renderNavigator();

    expect(screen.queryByText('Welcome back')).toBeNull();
    expect(screen.queryByText('Signed-in area')).toBeNull();
  });

  it('renders the auth stack when signed out', async () => {
    mockUseAuth.mockReturnValue(sessionWith(AUTH_STATUSES.SIGNED_OUT));

    await renderNavigator();

    expect(await screen.findByText('Welcome back')).toBeTruthy();
    expect(screen.queryByText('Signed-in area')).toBeNull();
  });

  it('renders the app stack when signed in', async () => {
    mockUseAuth.mockReturnValue(sessionWith(AUTH_STATUSES.SIGNED_IN));

    await renderNavigator();

    expect(await screen.findByText('Signed-in area')).toBeTruthy();
    expect(screen.queryByText('Create an account')).toBeNull();
  });
});
