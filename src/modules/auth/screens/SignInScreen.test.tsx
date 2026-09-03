import { fireEvent, render, screen } from '@testing-library/react-native';

import { registerErrorCopy, resetErrorCopy } from '@/errors';
import { API_ERROR_CODES, ApiError } from '@/lib';

import { AUTH_ERROR_COPY } from '../errorCopy';

import { useAuth } from '../hooks/useAuth';
import { SignInScreen } from './SignInScreen';

jest.mock('../hooks/useAuth');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const EMAIL_LABEL = 'Email';
const PASSWORD_LABEL = 'Password';
const SUBMIT_LABEL = 'Sign in';

const VALID_EMAIL = 'user@example.com';
const VALID_PASSWORD = 'sup3rS3cret!';

const navigation = { navigate: jest.fn() };

const mockSignIn = jest.fn();

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
    signIn: mockSignIn,
    signUp: jest.fn(),
    signOut: jest.fn(),
    signOutEverywhere: jest.fn(),
    isSubmitting: false,
    isSigningOut: false,
  });
});

const renderScreen = async () =>
  render(
    <SignInScreen navigation={navigation as never} route={{ key: 'k', name: 'SignIn' } as never} />,
  );

const fillAndSubmit = async (email: string, password: string) => {
  await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
  await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), password);
  await fireEvent.press(screen.getByText(SUBMIT_LABEL));
};

describe('SignInScreen', () => {
  it('does not submit a malformed email', async () => {
    await renderScreen();
    await fillAndSubmit('not-an-email', VALID_PASSWORD);

    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('submits trimmed credentials when the form is valid', async () => {
    mockSignIn.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(`  ${VALID_EMAIL}  `, VALID_PASSWORD);

    expect(mockSignIn).toHaveBeenCalledWith({ email: VALID_EMAIL, password: VALID_PASSWORD });
  });

  it('shows the invalid-credentials copy on a 401, never the API message', async () => {
    mockSignIn.mockRejectedValue(
      new ApiError({
        status: 401,
        code: API_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL, VALID_PASSWORD);

    expect(await screen.findByText('Email or password is incorrect.')).toBeTruthy();
    expect(screen.queryByText('Invalid credentials')).toBeNull();
  });

  it('falls back to generic copy for a code it does not know', async () => {
    mockSignIn.mockRejectedValue(
      new ApiError({ status: 418, code: 'A_CODE_SHIPPED_LATER', message: 'internal detail' }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL, VALID_PASSWORD);

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();
  });

  it('navigates to sign-up', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Create an account'));

    expect(navigation.navigate).toHaveBeenCalledWith('SignUp');
  });
});
