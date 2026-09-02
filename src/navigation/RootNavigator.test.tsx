import { render, screen } from '@testing-library/react-native';

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
    isSubmitting: false,
  }) as never;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RootNavigator', () => {
  it('shows neither stack while the session is still unknown', async () => {
    mockUseAuth.mockReturnValue(sessionWith(AUTH_STATUSES.LOADING));

    await render(<RootNavigator />);

    expect(screen.queryByText('Welcome back')).toBeNull();
    expect(screen.queryByText('Signed-in area')).toBeNull();
  });

  it('renders the auth stack when signed out', async () => {
    mockUseAuth.mockReturnValue(sessionWith(AUTH_STATUSES.SIGNED_OUT));

    await render(<RootNavigator />);

    expect(await screen.findByText('Welcome back')).toBeTruthy();
    expect(screen.queryByText('Signed-in area')).toBeNull();
  });

  it('renders the app stack when signed in', async () => {
    mockUseAuth.mockReturnValue(sessionWith(AUTH_STATUSES.SIGNED_IN));

    await render(<RootNavigator />);

    expect(await screen.findByText('Signed-in area')).toBeTruthy();
    expect(screen.queryByText('Create an account')).toBeNull();
  });
});
