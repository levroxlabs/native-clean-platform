import { userSchema } from './schemas';

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
