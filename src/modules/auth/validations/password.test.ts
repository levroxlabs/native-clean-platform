import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from './password';

const VALID_EMAIL = 'user@example.com';
const VALID_TOKEN = 'Yk9wYVF1ZVRva2VuRXhhbXBsZVZhbHVlMTIzNDU2Nzg5';
const CURRENT_PASSWORD = 'sup3rS3cret!';
const NEW_PASSWORD = 'ev3nS4fer!';

describe('forgotPasswordSchema', () => {
  it('accepts a well-formed address', () => {
    expect(forgotPasswordSchema.safeParse({ email: VALID_EMAIL }).success).toBe(true);
  });

  it('rejects a malformed address', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  const resetWith = (overrides: Record<string, string>) =>
    resetPasswordSchema.safeParse({
      token: VALID_TOKEN,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
      ...overrides,
    });

  it('accepts a base64url token of the length the API emits', () => {
    expect(resetWith({}).success).toBe(true);
  });

  it('rejects a token far too short to be one', () => {
    expect(resetWith({ token: 'abc' }).success).toBe(false);
  });

  it('rejects a token carrying a character base64url has no room for', () => {
    expect(resetWith({ token: `${VALID_TOKEN.slice(0, -1)}+` }).success).toBe(false);
  });

  it('enforces the password policy on the new password', () => {
    expect(resetWith({ newPassword: 'password', confirmPassword: 'password' }).success).toBe(false);
  });

  it('rejects a confirmation that does not match', () => {
    expect(resetWith({ confirmPassword: CURRENT_PASSWORD }).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  const changeWith = (overrides: Record<string, string>) =>
    changePasswordSchema.safeParse({
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
      ...overrides,
    });

  it('accepts a policy-satisfying new password', () => {
    expect(changeWith({}).success).toBe(true);
  });

  it('checks presence only on the current password, as sign-in does', () => {
    // An account created under a looser policy must stay able to change its
    // password, and rejecting locally would claim the password is malformed
    // when the truth is only that the API has to judge it.
    expect(changeWith({ currentPassword: 'x' }).success).toBe(true);
  });

  it('rejects an empty current password', () => {
    expect(changeWith({ currentPassword: '' }).success).toBe(false);
  });

  it('enforces the password policy on the new password', () => {
    expect(changeWith({ newPassword: 'password', confirmPassword: 'password' }).success).toBe(
      false,
    );
  });

  it('rejects a confirmation that does not match', () => {
    expect(changeWith({ confirmPassword: CURRENT_PASSWORD }).success).toBe(false);
  });
});
