import { renderHook } from '@testing-library/react-native';

import { useErrorToast } from './useErrorToast';

describe('useErrorToast', () => {
  it('throws when used outside ErrorToastProvider', async () => {
    await expect(renderHook(() => useErrorToast())).rejects.toThrow(
      'useErrorToast was called outside of <ErrorToastProvider>.',
    );
  });
});
