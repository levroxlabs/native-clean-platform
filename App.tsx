import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';

import {
  ErrorBoundary,
  ErrorToastProvider,
  registerErrorCopy,
  reportError,
  shouldRetry,
} from '@/errors';
import { startConnectivityWatch } from '@/lib';
import { AUTH_ERROR_COPY, AuthProvider } from '@/modules/auth';
import { RootNavigator } from '@/navigation';

/** `GestureHandlerRootView` needs a real style object — NativeWind cannot reach it. */
const ROOT_STYLE = { flex: 1 } as const;

const STATUS_BAR_STYLE = 'auto';

const QUERY_STALE_TIME_MS = 30000;

startConnectivityWatch();
registerErrorCopy(AUTH_ERROR_COPY);

/**
 * Module scope on purpose: a client built inside the component would be thrown
 * away and rebuilt on every render, taking the cache with it.
 *
 * Queries report by default — a background query has no call site to show its
 * failure. Mutations do not: a form already renders its submit error inline,
 * and toasting it too would say the same thing twice.
 */
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silent !== true) reportError(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.toastOnError === true) reportError(error);
    },
  }),
  defaultOptions: {
    queries: { retry: shouldRetry, staleTime: QUERY_STALE_TIME_MS },
  },
});

const App = () => (
  <GestureHandlerRootView style={ROOT_STYLE}>
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style={STATUS_BAR_STYLE} />
        <ErrorBoundary>
          <ErrorToastProvider>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </ErrorToastProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </QueryClientProvider>
  </GestureHandlerRootView>
);

export default App;
