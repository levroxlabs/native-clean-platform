import { signInSchema, signUpSchema } from './credentials';

const VALID_EMAIL = 'user@example.com';

describe('signUpSchema', () => {
  it('accepts an address on its own', () => {
    expect(signUpSchema.safeParse({ email: VALID_EMAIL }).success).toBe(true);
  });

  it('rejects a malformed address', () => {
    expect(signUpSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });

  it('takes no password: it is chosen at confirmation, where the API requires it', () => {
    const parsed = signUpSchema.safeParse({ email: VALID_EMAIL, password: 'sup3rS3cret!' });

    expect(parsed.success && 'password' in parsed.data).toBe(false);
  });
});

describe('signInSchema', () => {
  it('accepts a password that would fail the sign-up policy', () => {
    // An account created under a looser policy must stay able to log in, and
    // enforcing the policy here would answer "your password is malformed" where
    // the honest answer is "that is not your password".
    expect(signInSchema.safeParse({ email: VALID_EMAIL, password: 'x' }).success).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(signInSchema.safeParse({ email: VALID_EMAIL, password: '' }).success).toBe(false);
  });
});
