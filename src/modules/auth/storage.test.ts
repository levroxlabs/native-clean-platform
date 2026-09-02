import { clearAccessToken, readAccessToken, writeAccessToken } from './storage';

const TOKEN = 'stored-token';

beforeEach(async () => {
  await clearAccessToken();
});

describe('access token storage', () => {
  it('reads null when nothing was stored', async () => {
    await expect(readAccessToken()).resolves.toBeNull();
  });

  it('reads back what it wrote', async () => {
    await writeAccessToken(TOKEN);

    await expect(readAccessToken()).resolves.toBe(TOKEN);
  });

  it('reads null after clearing', async () => {
    await writeAccessToken(TOKEN);
    await clearAccessToken();

    await expect(readAccessToken()).resolves.toBeNull();
  });
});
