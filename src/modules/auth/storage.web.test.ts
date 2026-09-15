import { REFRESH_TOKEN_STORAGE_KEY } from './constants';
import { clearRefreshToken, readRefreshToken, writeRefreshToken } from './storage.web';

const TOKEN = 'stored-refresh-token';

/**
 * `localStorage` is a browser global. The test environment here is React
 * Native's, not a browser's, so this file is the only place that needs it.
 */
class InMemoryLocalStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

beforeEach(() => {
  globalThis.localStorage = new InMemoryLocalStorage() as unknown as Storage;
});

describe('refresh token storage (web)', () => {
  it('reads null when nothing was stored', async () => {
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  it('reads back what it wrote, under the same key the native storage uses', async () => {
    await writeRefreshToken(TOKEN);

    await expect(readRefreshToken()).resolves.toBe(TOKEN);
    expect(globalThis.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe(TOKEN);
  });

  it('reads null after clearing', async () => {
    await writeRefreshToken(TOKEN);
    await clearRefreshToken();

    await expect(readRefreshToken()).resolves.toBeNull();
  });
});
