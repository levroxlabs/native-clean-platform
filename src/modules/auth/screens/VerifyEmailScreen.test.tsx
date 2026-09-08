import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { registerErrorCopy, resetErrorCopy } from '@/errors';
import { API_ERROR_CODES, ApiError } from '@/lib';

import { resendVerificationCode } from '../api/authApi';
import { AUTH_ERROR_COPY } from '../errorCopy';
import { useAuth } from '../hooks/useAuth';
import { VerifyEmailScreen } from './VerifyEmailScreen';

jest.mock('../hooks/useAuth');
jest.mock('../api/authApi');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockResend = resendVerificationCode as jest.MockedFunction<typeof resendVerificationCode>;
const mockConfirmSignUp = jest.fn();

const EMAIL_LABEL = 'Email';
const CODE_LABEL = 'Verification code';
const PASSWORD_LABEL = 'Password';
const CONFIRM_LABEL = 'Confirm password';
const SUBMIT_LABEL = 'Create account';
const RESEND_LABEL = 'Send a new code';

const VALID_EMAIL = 'user@example.com';
const VALID_CODE = '042317';
const VALID_PASSWORD = 'sup3rS3cret!';
const COOLDOWN_SECONDS = 60;

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  resetErrorCopy();
  registerErrorCopy(AUTH_ERROR_COPY);
  mockUseAuth.mockReturnValue({
    status: 'signedOut',
    user: null,
    signIn: jest.fn(),
    confirmSignUp: mockConfirmSignUp,
    changePassword: jest.fn(),
    signOut: jest.fn(),
    signOutEverywhere: jest.fn(),
    isSubmitting: false,
    isSigningOut: false,
  });
});

/**
 * No default parameter: passing `undefined` to one falls back to the default,
 * which would make the "reached from the link" cases silently render the
 * "reached from sign-up" screen instead.
 */
const renderScreen = async (params: { email?: string } | undefined) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VerifyEmailScreen
        navigation={navigation as never}
        route={{ key: 'k', name: 'VerifyEmail', params } as never}
      />
    </QueryClientProvider>,
  );

/** Sign-up just sent a code, so the address is known and the cooldown runs. */
const renderFromSignUp = async () => renderScreen({ email: VALID_EMAIL });

/** The "I already have a code" link: no address, no cooldown. */
const renderFromLink = async () => renderScreen(undefined);

const fillAndSubmit = async (code: string, password: string, confirmation = password) => {
  await fireEvent.changeText(screen.getByLabelText(CODE_LABEL), code);
  await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), password);
  await fireEvent.changeText(screen.getByLabelText(CONFIRM_LABEL), confirmation);
  await fireEvent.press(screen.getByText(SUBMIT_LABEL));
};

describe('VerifyEmailScreen', () => {
  it('pre-fills the address the sign-up screen sent, and leaves it editable', async () => {
    // A typo means the code went to someone else's inbox; a read-only field
    // would leave no way back but to restart the flow.
    await renderFromSignUp();

    const input = screen.getByLabelText(EMAIL_LABEL);

    expect(input.props.value).toBe(VALID_EMAIL);
    expect(input.props.editable).not.toBe(false);
  });

  it('opens empty when reached from the "I already have a code" link', async () => {
    await renderFromLink();

    expect(screen.getByLabelText(EMAIL_LABEL).props.value).toBe('');
  });

  it('does not submit a five-digit code', async () => {
    await renderFromSignUp();
    await fillAndSubmit('04231', VALID_PASSWORD);

    expect(mockConfirmSignUp).not.toHaveBeenCalled();
  });

  it('does not submit when the two passwords differ', async () => {
    await renderFromSignUp();
    await fillAndSubmit(VALID_CODE, VALID_PASSWORD, 'sup3rS3cret!!');

    expect(mockConfirmSignUp).not.toHaveBeenCalled();
  });

  it('submits the address, the code and the chosen password', async () => {
    mockConfirmSignUp.mockResolvedValue(undefined);

    await renderFromSignUp();
    await fillAndSubmit(VALID_CODE, VALID_PASSWORD);

    expect(mockConfirmSignUp).toHaveBeenCalledWith({
      email: VALID_EMAIL,
      code: VALID_CODE,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD,
    });
    // Nothing navigates: RootStack renders one side or the other, so opening
    // the session unmounts this screen on its own.
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('gives every code failure the same words', async () => {
    mockConfirmSignUp.mockRejectedValue(
      new ApiError({
        status: 422,
        code: API_ERROR_CODES.EMAIL_VERIFICATION_FAILED,
        message: 'never rendered',
      }),
    );

    await renderFromSignUp();
    await fillAndSubmit(VALID_CODE, VALID_PASSWORD);

    expect(
      await screen.findByText('That code is not valid. Request a new one and try again.'),
    ).toBeTruthy();
  });

  it('holds the resend for a minute after arriving from sign-up', async () => {
    await renderFromSignUp();

    expect(screen.getByText(`${RESEND_LABEL} in ${COOLDOWN_SECONDS}s`)).toBeTruthy();
  });

  it('offers the resend at once when no code was just sent', async () => {
    await renderFromLink();

    expect(screen.getByText(RESEND_LABEL)).toBeTruthy();
  });

  it('restarts the countdown on a resolved resend, without asking what the API did', async () => {
    // A resend inside the server's own cooldown answers 202 and sends nothing.
    // Both outcomes look identical here, and must.
    mockResend.mockResolvedValue(undefined);

    await renderFromLink();
    await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), VALID_EMAIL);
    await act(async () => {
      await fireEvent.press(screen.getByText(RESEND_LABEL));
    });

    expect(mockResend).toHaveBeenCalledWith(VALID_EMAIL);
    expect(await screen.findByText(`${RESEND_LABEL} in ${COOLDOWN_SECONDS}s`)).toBeTruthy();
  });
});
