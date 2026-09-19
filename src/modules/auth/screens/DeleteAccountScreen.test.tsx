import { fireEvent, render, screen } from '@testing-library/react-native';

import { registerErrorCopy, resetErrorCopy } from '@/errors';
import { API_ERROR_CODES, ApiError } from '@/lib';

import { AUTH_ERROR_COPY } from '../errorCopy';
import { useAuth } from '../hooks/useAuth';
import { DeleteAccountScreen } from './DeleteAccountScreen';

jest.mock('../hooks/useAuth');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockDeleteAccount = jest.fn();

const PASSWORD_LABEL = 'Password';
const SUBMIT_LABEL = 'Delete account';
const PASSWORD = 'sup3rS3cret!';

const givenAuth = (overrides: Partial<ReturnType<typeof useAuth>> = {}) => {
  mockUseAuth.mockReturnValue({
    status: 'signedIn',
    user: null,
    signIn: jest.fn(),
    confirmSignUp: jest.fn(),
    changePassword: jest.fn(),
    deleteAccount: mockDeleteAccount,
    signOut: jest.fn(),
    signOutEverywhere: jest.fn(),
    isSubmitting: false,
    isSigningOut: false,
    ...overrides,
  });
};

const renderScreen = async () => render(<DeleteAccountScreen />);

const fillAndSubmit = async (password: string) => {
  await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), password);
  await fireEvent.press(screen.getByText(SUBMIT_LABEL));
};

beforeEach(() => {
  jest.clearAllMocks();
  resetErrorCopy();
  registerErrorCopy(AUTH_ERROR_COPY);
  givenAuth();
});

describe('DeleteAccountScreen', () => {
  it('warns that the deletion is permanent', async () => {
    await renderScreen();

    expect(screen.getByText(/permanent/i)).toBeTruthy();
  });

  it('does not submit an empty password', async () => {
    await renderScreen();
    await fillAndSubmit('');

    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('sends the password to delete the account', async () => {
    mockDeleteAccount.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(PASSWORD);

    expect(mockDeleteAccount).toHaveBeenCalledWith({ password: PASSWORD });
  });

  it('names the password as the thing that was wrong', async () => {
    mockDeleteAccount.mockRejectedValue(
      new ApiError({
        status: 422,
        code: API_ERROR_CODES.INVALID_CURRENT_PASSWORD,
        message: 'never rendered',
      }),
    );

    await renderScreen();
    await fillAndSubmit(PASSWORD);

    expect(await screen.findByText('That is not your current password.')).toBeTruthy();
  });

  it('says so when the request could not reach the server', async () => {
    mockDeleteAccount.mockRejectedValue(
      new ApiError({
        status: 0,
        code: API_ERROR_CODES.NETWORK_ERROR,
        message: 'never rendered',
      }),
    );

    await renderScreen();
    await fillAndSubmit(PASSWORD);

    expect(await screen.findByText(/Could not reach the server/)).toBeTruthy();
  });
});
