export type AuthStackParamList = {
  /** `email` pre-fills the form after a password reset, which revoked every session. */
  SignIn: { email?: string } | undefined;
  SignUp: undefined;
  /** `email` present means a code was just sent, which starts the resend countdown. */
  VerifyEmail: { email?: string } | undefined;
};
