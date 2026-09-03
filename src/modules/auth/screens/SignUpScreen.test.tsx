import { fireEvent, render, screen } from '@testing-library/react-native';

import { registerErrorCopy, resetErrorCopy } from '@/errors';
import { API_ERROR_CODES, ApiError } from '@/lib';

import { AUTH_ERROR_COPY } from '../errorCopy';

import { useAuth } from '../hooks/useAuth';
import { SignUpScreen } from './SignUpScreen';

jest.mock('../hooks/useAuth');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const EMAIL_LABEL = 'Email';
const PASSWORD_LABEL = 'Password';
const SUBMIT_LABEL = 'Create account';

const VALID_EMAIL = 'user@example.com';
const VALID_PASSWORD = 'sup3rS3cret!';

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const mockSignUp = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  // The copy for this module's own codes lives behind a registration that
  // App.tsx performs at boot. A screen rendered on its own has no composition
  // root, so it registers the same map the app would.
  resetErrorCopy();
  registerErrorCopy(AUTH_ERROR_COPY);
  mockUseAuth.mockReturnValue({
    status: 'signedOut',
    user: null,
    signIn: jest.fn(),
    signUp: mockSignUp,
    signOut: jest.fn(),
    signOutEverywhere: jest.fn(),
    isSubmitting: false,
    isSigningOut: false,
  });
});

const renderScreen = async () =>
  render(
    <SignUpScreen navigation={navigation as never} route={{ key: 'k', name: 'SignUp' } as never} />,
  );

const fillAndSubmit = async (email: string, password: string) => {
  await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
  await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), password);
  await fireEvent.press(screen.getByText(SUBMIT_LABEL));
};

describe('SignUpScreen', () => {
  it('enforces the API password policy before submitting', async () => {
    await renderScreen();
    await fillAndSubmit(VALID_EMAIL, 'password');

    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('submits a password that satisfies the policy', async () => {
    mockSignUp.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL, VALID_PASSWORD);

    expect(mockSignUp).toHaveBeenCalledWith({ email: VALID_EMAIL, password: VALID_PASSWORD });
  });

  it('shows the conflict copy when the email is taken', async () => {
    mockSignUp.mockRejectedValue(
      new ApiError({
        status: 409,
        code: API_ERROR_CODES.EMAIL_ALREADY_IN_USE,
        message: 'Email already in use',
      }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL, VALID_PASSWORD);

    expect(await screen.findByText('This email is already registered.')).toBeTruthy();
  });

  it('puts a server field error on the field it belongs to', async () => {
    mockSignUp.mockRejectedValue(
      new ApiError({
        status: 400,
        code: API_ERROR_CODES.VALIDATION_ERROR,
        message: 'Invalid payload',
        details: [{ field: 'email', code: 'invalid_format' }],
      }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL, VALID_PASSWORD);

    expect(await screen.findByText('The server rejected this value.')).toBeTruthy();
  });
});
