import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

/**
 * React Native has no `navigator.onLine`, so without this TanStack Query
 * assumes the device is permanently online: it never pauses a query and it
 * burns retries against a radio that is off. Wiring it makes queries pause
 * while offline and resume on reconnect.
 *
 * Called once, from `App.tsx`. The app never unsubscribes — the listener lives
 * exactly as long as the process.
 */
export const startConnectivityWatch = (): void => {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected));
    }),
  );
};
