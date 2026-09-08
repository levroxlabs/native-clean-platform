import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { registerErrorCopy, resetErrorCopy } from '@/errors';
import { API_ERROR_CODES, ApiError } from '@/lib';

import { requestPasswordReset } from '../api/authApi';
import { AUTH_ERROR_COPY } from '../errorCopy';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';

jest.mock('../api/authApi');

const mockRequestPasswordReset = requestPasswordReset as jest.MockedFunction<
  typeof requestPasswordReset
>;

const EMAIL_LABEL = 'Email';
const SUBMIT_LABEL = 'Send the token';

const VALID_EMAIL = 'user@example.com';
const EMAIL_WITHOUT_ACCOUNT = 'nobody@example.com';

const navigation = { navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  resetErrorCopy();
  registerErrorCopy(AUTH_ERROR_COPY);
});

const renderScreen = async () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ForgotPasswordScreen
        navigation={navigation as never}
        route={{ key: 'k', name: 'ForgotPassword' } as never}
      />
    </QueryClientProvider>,
  );

const fillAndSubmit = async (email: string) => {
  await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
  await fireEvent.press(screen.getByText(SUBMIT_LABEL));
};

describe('ForgotPasswordScreen', () => {
  it('does not submit a malformed email', async () => {
    await renderScreen();
    await fillAndSubmit('not-an-email');

    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it('sends the address and moves to the reset screen', async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL);

    expect(mockRequestPasswordReset).toHaveBeenCalledWith(VALID_EMAIL);
    expect(navigation.navigate).toHaveBeenCalledWith('ResetPassword', { email: VALID_EMAIL });
  });

  it('advances for an address with no account, exactly as for one with an account', async () => {
    // The API answers 202 to both and emails nothing to the first. A branch
    // here would be an account oracle the API refuses to be.
    mockRequestPasswordReset.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(EMAIL_WITHOUT_ACCOUNT);

    expect(navigation.navigate).toHaveBeenCalledWith('ResetPassword', {
      email: EMAIL_WITHOUT_ACCOUNT,
    });
  });

  it('reports a rate limit instead of pretending it advanced', async () => {
    mockRequestPasswordReset.mockRejectedValue(
      new ApiError({
        status: 429,
        code: API_ERROR_CODES.TOO_MANY_REQUESTS,
        message: 'never rendered',
      }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL);

    expect(
      await screen.findByText('Too many attempts. Please wait a moment and try again.'),
    ).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
