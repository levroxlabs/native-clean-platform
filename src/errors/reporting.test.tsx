import { QueryCache, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { type Metrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { API_ERROR_CODES, ApiError } from '@/lib';

import { resetErrorCopy } from './copy';
import { ErrorToastProvider } from './ErrorToast';
import { reportError } from './reporter';

const OFFLINE_COPY = 'Could not reach the server. Check your connection.';
const LOADING_TEXT = 'loading';

const offlineError = new ApiError({
  status: 0,
  code: API_ERROR_CODES.NETWORK_ERROR,
  message: 'never rendered',
});

/** The toast reads safe-area insets, which throw with no provider above them. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const FailingQuery = () => {
  useQuery({
    queryKey: ['probe'],
    queryFn: async () => Promise.reject(offlineError),
    retry: false,
  });

  return <Text>{LOADING_TEXT}</Text>;
};

const SilentQuery = () => {
  useQuery({
    queryKey: ['silent-probe'],
    queryFn: async () => Promise.reject(offlineError),
    retry: false,
    meta: { silent: true },
  });

  return <Text>{LOADING_TEXT}</Text>;
};

const renderApp = async (silent: boolean) => {
  // Its own client, not App.tsx's: this proves the seam, not the composition
  // root, and a shared client would carry cache between the two cases.
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.silent !== true) reportError(error);
      },
    }),
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        <ErrorToastProvider>{silent ? <SilentQuery /> : <FailingQuery />}</ErrorToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
};

beforeEach(() => {
  resetErrorCopy();
});

describe('a failing query', () => {
  it('reaches the toast through the registered reporter', async () => {
    await renderApp(false);

    expect(await screen.findByText(OFFLINE_COPY)).toBeTruthy();
  });

  it('stays silent when the query opted out with meta.silent', async () => {
    await renderApp(true);
    await screen.findByText(LOADING_TEXT);

    expect(screen.queryByText(OFFLINE_COPY)).toBeNull();
  });
});
