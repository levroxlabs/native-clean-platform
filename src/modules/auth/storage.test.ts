import { clearRefreshToken, readRefreshToken, writeRefreshToken } from './storage';

const TOKEN = 'stored-refresh-token';

beforeEach(async () => {
  await clearRefreshToken();
});

describe('refresh token storage', () => {
  it('reads null when nothing was stored', async () => {
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  it('reads back what it wrote', async () => {
    await writeRefreshToken(TOKEN);

    await expect(readRefreshToken()).resolves.toBe(TOKEN);
  });

  it('reads null after clearing', async () => {
    await writeRefreshToken(TOKEN);
    await clearRefreshToken();

    await expect(readRefreshToken()).resolves.toBeNull();
  });
});
