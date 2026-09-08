export type AuthStackParamList = {
  /** `email` pre-fills the form after a password reset, which revoked every session. */
  SignIn: { email?: string } | undefined;
  SignUp: undefined;
  /** `email` present means a code was just sent, which starts the resend countdown. */
  VerifyEmail: { email?: string } | undefined;
  ForgotPassword: undefined;
  /** Carried for the sign-in form afterwards; the reset body itself has no email. */
  ResetPassword: { email: string };
};

/** The signed-in flow this module owns, reached as one screen of the app shell. */
export type AccountStackParamList = {
  Account: undefined;
  ChangePassword: undefined;
};
