import { fireEvent, render, screen } from '@testing-library/react-native';

import { registerErrorCopy, resetErrorCopy } from '@/errors';
import { API_ERROR_CODES, ApiError } from '@/lib';

import { AUTH_ERROR_COPY } from '../errorCopy';
import { useAuth } from '../hooks/useAuth';
import { ChangePasswordScreen } from './ChangePasswordScreen';

jest.mock('../hooks/useAuth');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockChangePassword = jest.fn();

const CURRENT_LABEL = 'Current password';
const NEW_LABEL = 'New password';
const CONFIRM_LABEL = 'Confirm password';
const SUBMIT_LABEL = 'Change password';

const CURRENT_PASSWORD = 'sup3rS3cret!';
const NEW_PASSWORD = 'ev3nS4fer!';

const navigation = { goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  resetErrorCopy();
  registerErrorCopy(AUTH_ERROR_COPY);
  mockUseAuth.mockReturnValue({
    status: 'signedIn',
    user: null,
    signIn: jest.fn(),
    confirmSignUp: jest.fn(),
    changePassword: mockChangePassword,
    signOut: jest.fn(),
    signOutEverywhere: jest.fn(),
    isSubmitting: false,
    isSigningOut: false,
  });
});

const renderScreen = async () =>
  render(
    <ChangePasswordScreen
      navigation={navigation as never}
      route={{ key: 'k', name: 'ChangePassword' } as never}
    />,
  );

const fillAndSubmit = async (current: string, next: string, confirmation = next) => {
  await fireEvent.changeText(screen.getByLabelText(CURRENT_LABEL), current);
  await fireEvent.changeText(screen.getByLabelText(NEW_LABEL), next);
  await fireEvent.changeText(screen.getByLabelText(CONFIRM_LABEL), confirmation);
  await fireEvent.press(screen.getByText(SUBMIT_LABEL));
};

describe('ChangePasswordScreen', () => {
  it('does not submit a new password that fails the policy', async () => {
    await renderScreen();
    await fillAndSubmit(CURRENT_PASSWORD, 'password');

    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('does not submit when the confirmation does not match', async () => {
    await renderScreen();
    await fillAndSubmit(CURRENT_PASSWORD, NEW_PASSWORD, CURRENT_PASSWORD);

    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('submits both passwords and goes back once it succeeds', async () => {
    mockChangePassword.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(CURRENT_PASSWORD, NEW_PASSWORD);

    expect(mockChangePassword).toHaveBeenCalledWith({
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('names the current password as the thing that was wrong', async () => {
    mockChangePassword.mockRejectedValue(
      new ApiError({
        status: 422,
        code: API_ERROR_CODES.INVALID_CURRENT_PASSWORD,
        message: 'never rendered',
      }),
    );

    await renderScreen();
    await fillAndSubmit(CURRENT_PASSWORD, NEW_PASSWORD);

    expect(await screen.findByText('That is not your current password.')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('says the new password has to differ from the old one', async () => {
    mockChangePassword.mockRejectedValue(
      new ApiError({
        status: 422,
        code: API_ERROR_CODES.PASSWORD_UNCHANGED,
        message: 'never rendered',
      }),
    );

    await renderScreen();
    await fillAndSubmit(CURRENT_PASSWORD, NEW_PASSWORD);

    expect(
      await screen.findByText('Choose a password different from your current one.'),
    ).toBeTruthy();
  });
});
