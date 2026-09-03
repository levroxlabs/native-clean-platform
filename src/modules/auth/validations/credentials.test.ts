import { signInSchema, signUpSchema } from './credentials';

const VALID_EMAIL = 'user@example.com';
const VALID_PASSWORD = 'sup3rS3cret!';

const signUpWith = (password: string) =>
  signUpSchema.safeParse({ email: VALID_EMAIL, password }).success;

describe('signUpSchema', () => {
  it('accepts the API own documented example', () => {
    expect(signUpWith(VALID_PASSWORD)).toBe(true);
  });

  it('rejects a password one character below the minimum', () => {
    expect(signUpWith('aB3456!')).toBe(false);
  });

  it('accepts a password exactly at the minimum', () => {
    expect(signUpWith('aB34567!')).toBe(true);
  });

  it('accepts a password exactly at the maximum', () => {
    expect(signUpWith(`aB3!${'x'.repeat(124)}`)).toBe(true);
  });

  it('rejects a password one character above the maximum', () => {
    expect(signUpWith(`aB3!${'x'.repeat(125)}`)).toBe(false);
  });

  it('rejects a password with no digit', () => {
    expect(signUpWith('abcdefgH!')).toBe(false);
  });

  it('rejects a password with no letter', () => {
    expect(signUpWith('12345678!')).toBe(false);
  });

  it('rejects a password with no symbol', () => {
    expect(signUpWith('abcdefG123')).toBe(false);
  });

  it('rejects a malformed email', () => {
    expect(
      signUpSchema.safeParse({ email: 'not-an-email', password: VALID_PASSWORD }).success,
    ).toBe(false);
  });

  it('reports human copy rather than zod internals', () => {
    // If this fails on the message and not on the parse, the installed zod
    // wants `{ error: '...' }` instead of the string shorthand — change the
    // four call sites in `schemas.ts`, not this expectation.
    const parsed = signUpSchema.safeParse({ email: 'nope', password: VALID_PASSWORD });

    expect(parsed.success).toBe(false);
    expect(parsed.success ? null : parsed.error.issues[0]?.message).toBe(
      'Enter a valid email address.',
    );
  });

  it('trims the email before validating it', () => {
    const parsed = signUpSchema.safeParse({
      email: `  ${VALID_EMAIL}  `,
      password: VALID_PASSWORD,
    });

    expect(parsed.success && parsed.data.email).toBe(VALID_EMAIL);
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
