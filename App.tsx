import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';

import { AuthProvider } from '@/modules/auth';
import { RootNavigator } from '@/navigation';

/** `GestureHandlerRootView` needs a real style object — NativeWind cannot reach it. */
const ROOT_STYLE = { flex: 1 } as const;

const STATUS_BAR_STYLE = 'auto';

const QUERY_RETRY_COUNT = 1;
const QUERY_STALE_TIME_MS = 30000;

/**
 * Module scope on purpose: a client built inside the component would be thrown
 * away and rebuilt on every render, taking the cache with it.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: QUERY_RETRY_COUNT, staleTime: QUERY_STALE_TIME_MS } },
});

const App = () => (
  <GestureHandlerRootView style={ROOT_STYLE}>
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style={STATUS_BAR_STYLE} />
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  </GestureHandlerRootView>
);

export default App;
