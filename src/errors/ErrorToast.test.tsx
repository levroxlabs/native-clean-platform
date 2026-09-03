import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { type Metrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { API_ERROR_CODES, ApiError } from '@/lib';

import { registerErrorCopy, resetErrorCopy } from './copy';
import { ErrorToastProvider } from './ErrorToast';
import { reportError } from './reporter';
import { useErrorToast } from './useErrorToast';

const OFFLINE_COPY = 'Could not reach the server. Check your connection.';
const TRIGGER_LABEL = 'trigger';

const offlineError = new ApiError({
  status: 0,
  code: API_ERROR_CODES.NETWORK_ERROR,
  message: 'never rendered',
});

const sessionError = new ApiError({
  status: 401,
  code: API_ERROR_CODES.INVALID_ACCESS_TOKEN,
  message: 'never rendered',
});

const Trigger = ({ error }: { error: unknown }) => {
  const { showError } = useErrorToast();

  return (
    <Pressable onPress={() => showError(error)}>
      <Text>{TRIGGER_LABEL}</Text>
    </Pressable>
  );
};

/**
 * `useSafeAreaInsets()` throws with no provider above it, so every render of
 * the toast needs one. `initialMetrics` skips the native measurement, which
 * never resolves under Jest.
 */
const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const withProviders = (error: unknown) => (
  <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
    <ErrorToastProvider>
      <Trigger error={error} />
    </ErrorToastProvider>
  </SafeAreaProvider>
);

const renderWithProvider = async (error: unknown) => render(withProviders(error));

beforeEach(() => {
  resetErrorCopy();
});

describe('ErrorToastProvider', () => {
  it('shows nothing until an error arrives', async () => {
    await renderWithProvider(offlineError);

    expect(screen.queryByText(OFFLINE_COPY)).toBeNull();
  });

  it('renders the copy chosen for the error, never the API message', async () => {
    await renderWithProvider(offlineError);
    await fireEvent.press(screen.getByText(TRIGGER_LABEL));

    expect(await screen.findByText(OFFLINE_COPY)).toBeTruthy();
    expect(screen.queryByText('never rendered')).toBeNull();
  });

  it('stays silent for a session error, which is already sending the user to sign-in', async () => {
    await renderWithProvider(sessionError);
    await fireEvent.press(screen.getByText(TRIGGER_LABEL));

    expect(screen.queryByText(OFFLINE_COPY)).toBeNull();
  });

  it('replaces the current message rather than queueing', async () => {
    registerErrorCopy({ SECOND_CODE: 'the second problem' });

    const { rerender } = await renderWithProvider(offlineError);
    await fireEvent.press(screen.getByText(TRIGGER_LABEL));
    expect(await screen.findByText(OFFLINE_COPY)).toBeTruthy();

    await rerender(withProviders(new ApiError({ status: 400, code: 'SECOND_CODE', message: 'x' })));
    await fireEvent.press(screen.getByText(TRIGGER_LABEL));

    expect(await screen.findByText('the second problem')).toBeTruthy();
    expect(screen.queryByText(OFFLINE_COPY)).toBeNull();
  });

  it('dismisses when the toast is tapped', async () => {
    await renderWithProvider(offlineError);
    await fireEvent.press(screen.getByText(TRIGGER_LABEL));
    await screen.findByText(OFFLINE_COPY);

    await fireEvent.press(screen.getByText(OFFLINE_COPY));

    // The message is removed by the fade-out's completion callback, not by the
    // tap, so this has to wait for the animation rather than assert straight
    // after the press.
    await waitFor(() => {
      expect(screen.queryByText(OFFLINE_COPY)).toBeNull();
    });
  });

  it('registers itself as the reporter while mounted', async () => {
    await renderWithProvider(offlineError);

    reportError(offlineError);

    expect(await screen.findByText(OFFLINE_COPY)).toBeTruthy();
  });

  it('unregisters on unmount, so a late error cannot reach a dead provider', async () => {
    const { unmount } = await renderWithProvider(offlineError);

    await unmount();

    expect(() => reportError(offlineError)).not.toThrow();
  });
});
