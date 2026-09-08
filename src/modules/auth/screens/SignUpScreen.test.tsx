import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { registerErrorCopy, resetErrorCopy } from '@/errors';
import { API_ERROR_CODES, ApiError } from '@/lib';

import { startSignUp } from '../api/authApi';
import { AUTH_ERROR_COPY } from '../errorCopy';
import { SignUpScreen } from './SignUpScreen';

jest.mock('../api/authApi');

const mockStartSignUp = startSignUp as jest.MockedFunction<typeof startSignUp>;

const EMAIL_LABEL = 'Email';
const SUBMIT_LABEL = 'Send the code';

const VALID_EMAIL = 'user@example.com';
const TAKEN_EMAIL = 'taken@example.com';

const navigation = { navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  resetErrorCopy();
  registerErrorCopy(AUTH_ERROR_COPY);
});

const renderScreen = async () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SignUpScreen
        navigation={navigation as never}
        route={{ key: 'k', name: 'SignUp' } as never}
      />
    </QueryClientProvider>,
  );

const fillAndSubmit = async (email: string) => {
  await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
  await fireEvent.press(screen.getByText(SUBMIT_LABEL));
};

describe('SignUpScreen', () => {
  it('does not submit a malformed email', async () => {
    await renderScreen();
    await fillAndSubmit('not-an-email');

    expect(mockStartSignUp).not.toHaveBeenCalled();
  });

  it('sends the address alone and moves to the code screen', async () => {
    mockStartSignUp.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL);

    expect(mockStartSignUp).toHaveBeenCalledWith(VALID_EMAIL);
    expect(navigation.navigate).toHaveBeenCalledWith('VerifyEmail', { email: VALID_EMAIL });
  });

  it('advances for an address that already has an account, exactly as for a free one', async () => {
    // The API answers 202 to both. A branch here would rebuild the account
    // enumeration it deliberately removed.
    mockStartSignUp.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(TAKEN_EMAIL);

    expect(navigation.navigate).toHaveBeenCalledWith('VerifyEmail', { email: TAKEN_EMAIL });
  });

  it('stays put and reports the failure when the request does not reach the API', async () => {
    mockStartSignUp.mockRejectedValue(
      new ApiError({
        status: 0,
        code: API_ERROR_CODES.NETWORK_ERROR,
        message: 'never rendered',
      }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL);

    expect(
      await screen.findByText('Could not reach the server. Check your connection.'),
    ).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
