import { confirmSignUpSchema } from './verification';

const VALID_EMAIL = 'user@example.com';
const VALID_CODE = '042317';
const VALID_PASSWORD = 'sup3rS3cret!';

const confirmWith = (overrides: Record<string, string>) =>
  confirmSignUpSchema.safeParse({
    email: VALID_EMAIL,
    code: VALID_CODE,
    password: VALID_PASSWORD,
    confirmPassword: VALID_PASSWORD,
    ...overrides,
  });

describe('confirmSignUpSchema', () => {
  it('accepts a six-digit code with a policy-satisfying password', () => {
    expect(confirmWith({}).success).toBe(true);
  });

  it('rejects a five-digit code', () => {
    expect(confirmWith({ code: '04231' }).success).toBe(false);
  });

  it('rejects a seven-digit code', () => {
    expect(confirmWith({ code: '0423178' }).success).toBe(false);
  });

  it('rejects a code with a letter in it', () => {
    expect(confirmWith({ code: '04231a' }).success).toBe(false);
  });

  it('enforces the full password policy, unlike sign-in', () => {
    expect(confirmWith({ password: 'password', confirmPassword: 'password' }).success).toBe(false);
  });

  it('rejects a confirmation that does not match', () => {
    expect(confirmWith({ confirmPassword: 'sup3rS3cret!!' }).success).toBe(false);
  });

  it('puts the mismatch on the confirmation field, where the user can see it', () => {
    const result = confirmWith({ confirmPassword: 'sup3rS3cret!!' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
  });
});
