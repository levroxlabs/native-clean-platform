import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

import { startConnectivityWatch } from './connectivity';

type NetInfoChangeHandler = (state: { isConnected: boolean | null }) => void;

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(),
}));

const mockAddEventListener = jest.mocked(NetInfo.addEventListener);

/**
 * `onlineManager` is a process-wide singleton also driven by
 * AuthContext.test.tsx. Jest isolates the module registry per test file, so
 * this state cannot leak across files, but nothing stops it leaking across
 * the `it`s in this one — replacing the listener is exactly what this file
 * exists to exercise, unlike files that only call `setOnline`.
 */
afterEach(() => {
  onlineManager.setEventListener(() => undefined);
  onlineManager.setOnline(true);
});

describe('startConnectivityWatch', () => {
  it('registers a NetInfo listener', async () => {
    startConnectivityWatch();

    expect(mockAddEventListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it('reports online when NetInfo says the device is connected', async () => {
    startConnectivityWatch();
    const [handler] = mockAddEventListener.mock.calls.at(-1) as [NetInfoChangeHandler];
    // Starts from offline so the assertion below proves the handler actually
    // flips the state back on, not just that it was already true by default.
    handler({ isConnected: false });

    handler({ isConnected: true });

    expect(onlineManager.isOnline()).toBe(true);
  });

  it('reports offline when NetInfo says the device is disconnected', async () => {
    startConnectivityWatch();
    const [handler] = mockAddEventListener.mock.calls.at(-1) as [NetInfoChangeHandler];

    handler({ isConnected: false });

    expect(onlineManager.isOnline()).toBe(false);
  });

  it('reports offline when NetInfo cannot determine connectivity', async () => {
    // isConnected is `null` while NetInfo has not resolved a state yet
    // (README: "unknown" state) — Boolean(null) must coerce to offline, not
    // leave TanStack Query defaulting to its own permanently-online assumption.
    startConnectivityWatch();
    const [handler] = mockAddEventListener.mock.calls.at(-1) as [NetInfoChangeHandler];

    handler({ isConnected: null });

    expect(onlineManager.isOnline()).toBe(false);
  });
});
