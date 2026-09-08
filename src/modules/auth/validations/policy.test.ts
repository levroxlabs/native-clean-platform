import { emailSchema, newPasswordSchema } from './policy';

const VALID_EMAIL = 'user@example.com';
const VALID_PASSWORD = 'sup3rS3cret!';

const passwordAccepts = (password: string) => newPasswordSchema.safeParse(password).success;

/**
 * The password policy and the address rules live here now, because this is where
 * the schemas do. They used to be exercised through `signUpSchema`, which no
 * longer carries a password: sign-up takes the address alone and the password is
 * chosen at confirmation.
 */
describe('newPasswordSchema', () => {
  it("accepts the API's own documented example", () => {
    expect(passwordAccepts(VALID_PASSWORD)).toBe(true);
  });

  it('rejects a password one character below the minimum', () => {
    expect(passwordAccepts('aB3456!')).toBe(false);
  });

  it('accepts a password exactly at the minimum', () => {
    expect(passwordAccepts('aB34567!')).toBe(true);
  });

  it('accepts a password exactly at the maximum', () => {
    expect(passwordAccepts(`aB3!${'x'.repeat(124)}`)).toBe(true);
  });

  it('rejects a password one character above the maximum', () => {
    expect(passwordAccepts(`aB3!${'x'.repeat(125)}`)).toBe(false);
  });

  it('rejects a password with no digit', () => {
    expect(passwordAccepts('abcdefgH!')).toBe(false);
  });

  it('rejects a password with no letter', () => {
    expect(passwordAccepts('12345678!')).toBe(false);
  });

  it('rejects a password with no symbol', () => {
    expect(passwordAccepts('abcdefG123')).toBe(false);
  });
});

describe('emailSchema', () => {
  it('rejects a malformed address', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('reports human copy rather than zod internals', () => {
    // If this fails on the message and not on the parse, the installed zod
    // wants `{ error: '...' }` instead of the string shorthand — change the
    // call sites in `policy.ts`, not this expectation.
    const parsed = emailSchema.safeParse('nope');

    expect(parsed.success).toBe(false);
    expect(parsed.success ? null : parsed.error.issues[0]?.message).toBe(
      'Enter a valid email address.',
    );
  });

  it('trims the address before validating it', () => {
    expect(emailSchema.safeParse(`  ${VALID_EMAIL}  `).data).toBe(VALID_EMAIL);
  });
});
