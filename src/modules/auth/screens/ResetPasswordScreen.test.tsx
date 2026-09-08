import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { registerErrorCopy, resetErrorCopy } from '@/errors';
import { API_ERROR_CODES, ApiError } from '@/lib';

import { resetPassword } from '../api/authApi';
import { AUTH_ERROR_COPY } from '../errorCopy';
import { ResetPasswordScreen } from './ResetPasswordScreen';

jest.mock('../api/authApi');

const mockResetPassword = resetPassword as jest.MockedFunction<typeof resetPassword>;

const TOKEN_LABEL = 'Reset token';
const NEW_PASSWORD_LABEL = 'New password';
const CONFIRM_LABEL = 'Confirm password';
const SUBMIT_LABEL = 'Reset password';

const VALID_EMAIL = 'user@example.com';
const VALID_TOKEN = 'Yk9wYVF1ZVRva2VuRXhhbXBsZVZhbHVlMTIzNDU2Nzg5';
const NEW_PASSWORD = 'ev3nS4fer!';

const navigation = { navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  resetErrorCopy();
  registerErrorCopy(AUTH_ERROR_COPY);
});

const renderScreen = async () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ResetPasswordScreen
        navigation={navigation as never}
        route={{ key: 'k', name: 'ResetPassword', params: { email: VALID_EMAIL } } as never}
      />
    </QueryClientProvider>,
  );

const fillAndSubmit = async (token: string, password: string, confirmation = password) => {
  await fireEvent.changeText(screen.getByLabelText(TOKEN_LABEL), token);
  await fireEvent.changeText(screen.getByLabelText(NEW_PASSWORD_LABEL), password);
  await fireEvent.changeText(screen.getByLabelText(CONFIRM_LABEL), confirmation);
  await fireEvent.press(screen.getByText(SUBMIT_LABEL));
};

describe('ResetPasswordScreen', () => {
  it('does not submit something that is not a base64url token', async () => {
    await renderScreen();
    await fillAndSubmit('abc', NEW_PASSWORD);

    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('does not submit when the two passwords differ', async () => {
    await renderScreen();
    await fillAndSubmit(VALID_TOKEN, NEW_PASSWORD, 'something3lse!');

    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('sends the token and the new password, and nothing else', async () => {
    mockResetPassword.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(VALID_TOKEN, NEW_PASSWORD);

    // No email: the API body is `{ token, newPassword }` and `.strict()`.
    expect(mockResetPassword).toHaveBeenCalledWith({
      token: VALID_TOKEN,
      newPassword: NEW_PASSWORD,
    });
  });

  it('returns to sign-in with the address filled in, because every session died', async () => {
    mockResetPassword.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(VALID_TOKEN, NEW_PASSWORD);

    expect(navigation.navigate).toHaveBeenCalledWith('SignIn', { email: VALID_EMAIL });
  });

  it('gives every token failure the same words', async () => {
    mockResetPassword.mockRejectedValue(
      new ApiError({
        status: 422,
        code: API_ERROR_CODES.PASSWORD_RESET_FAILED,
        message: 'never rendered',
      }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_TOKEN, NEW_PASSWORD);

    expect(
      await screen.findByText(
        'That token is not valid. Start the recovery again to get a new one.',
      ),
    ).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
