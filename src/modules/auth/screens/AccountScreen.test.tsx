import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useErrorToast } from '@/errors';

import { useAuth } from '../hooks/useAuth';
import { AccountScreen } from './AccountScreen';

jest.mock('../hooks/useAuth');
jest.mock('@/errors', () => ({ useErrorToast: jest.fn() }));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseErrorToast = useErrorToast as jest.MockedFunction<typeof useErrorToast>;

const VALID_EMAIL = 'user@example.com';
const CHANGE_PASSWORD_LABEL = 'Change password';
const SIGN_OUT_LABEL = 'Sign out';
const SIGN_OUT_EVERYWHERE_LABEL = 'Sign out everywhere';

const PROFILE = {
  id: '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21',
  email: VALID_EMAIL,
  emailVerifiedAt: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};

const navigation = { navigate: jest.fn() };
const mockSignOut = jest.fn(async () => undefined);
const mockSignOutEverywhere = jest.fn(async () => undefined);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseErrorToast.mockReturnValue({ showError: jest.fn() });
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
  });
});

const renderScreen = async () =>
  render(
    <AccountScreen
      navigation={navigation as never}
      route={{ key: 'k', name: 'Account' } as never}
    />,
  );

describe('AccountScreen', () => {
  it('shows the address of the signed-in account', async () => {
    await renderScreen();

    expect(screen.getByText(VALID_EMAIL)).toBeTruthy();
  });

  it('opens the password screen', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText(CHANGE_PASSWORD_LABEL));

    expect(navigation.navigate).toHaveBeenCalledWith('ChangePassword');
  });

  it('signs out on this device', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText(SIGN_OUT_LABEL));

    expect(mockSignOut).toHaveBeenCalled();
  });

  it('asks before ending every session, since it cannot be undone', async () => {
    const alert = jest.spyOn(Alert, 'alert');

    await renderScreen();
    await fireEvent.press(screen.getByText(SIGN_OUT_EVERYWHERE_LABEL));

    expect(alert).toHaveBeenCalled();
    expect(mockSignOutEverywhere).not.toHaveBeenCalled();
  });
});
