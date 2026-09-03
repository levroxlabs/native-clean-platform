import { sessionTokensSchema, userSchema } from './schemas';

const VALID_EMAIL = 'user@example.com';

describe('userSchema', () => {
  it('parses the profile the API returns', () => {
    const parsed = userSchema.safeParse({
      id: '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21',
      email: VALID_EMAIL,
      emailVerifiedAt: null,
      createdAt: '2026-09-01T12:00:00.000Z',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects a profile missing a field the app renders', () => {
    expect(
      userSchema.safeParse({ id: '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21', email: VALID_EMAIL })
        .success,
    ).toBe(false);
  });
});

describe('sessionTokensSchema', () => {
  it('parses the pair the API returns in body transport', () => {
    expect(
      sessionTokensSchema.safeParse({ accessToken: 'an-access', refreshToken: 'a-refresh' })
        .success,
    ).toBe(true);
  });

  it('rejects a response with no refresh token', () => {
    // The API declares it optional because one schema serves both transports.
    // This client always asks for body transport, so an answer without it is
    // drift, and it should be loud rather than silently signing the user out an
    // hour later.
    expect(sessionTokensSchema.safeParse({ accessToken: 'an-access' }).success).toBe(false);
  });

  it('rejects an empty token on either half', () => {
    expect(
      sessionTokensSchema.safeParse({ accessToken: '', refreshToken: 'a-refresh' }).success,
    ).toBe(false);
    expect(
      sessionTokensSchema.safeParse({ accessToken: 'an-access', refreshToken: '' }).success,
    ).toBe(false);
  });
});
