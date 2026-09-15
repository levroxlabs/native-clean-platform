import { renderHook } from '@testing-library/react-native';

import { useAuth } from './useAuth';

describe('useAuth', () => {
  it('throws when used outside AuthProvider', async () => {
    await expect(renderHook(() => useAuth())).rejects.toThrow(
      'useAuth was called outside of <AuthProvider>.',
    );
  });
});
