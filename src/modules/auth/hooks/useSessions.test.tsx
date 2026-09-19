import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { fetchSessions } from '../api/authApi';
import { useSessions } from './useSessions';

jest.mock('../api/authApi');

const mockFetchSessions = fetchSessions as jest.MockedFunction<typeof fetchSessions>;

const SESSION = {
  id: '5b1f6c0e-2d7a-4c53-8a49-0e6f3d9b7a12',
  createdAt: '2026-09-19T10:00:00.000Z',
  expiresAt: '2026-11-18T10:00:00.000Z',
  ip: '203.0.113.7',
  deviceLabel: 'Chrome on Android',
  startedAt: '2026-09-01T12:00:00.000Z',
};

const renderUseSessions = async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return renderHook(() => useSessions(), { wrapper });
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useSessions', () => {
  it('loads the active sessions of the account', async () => {
    mockFetchSessions.mockResolvedValue([SESSION]);

    const { result } = await renderUseSessions();

    await waitFor(() => {
      expect(result.current.data).toEqual([SESSION]);
    });
  });

  it('surfaces the failure instead of pausing while offline', async () => {
    mockFetchSessions.mockRejectedValue(new Error('offline'));

    const { result } = await renderUseSessions();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
