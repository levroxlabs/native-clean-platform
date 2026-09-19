import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ActiveSession } from '../api/schemas';
import { useSessions } from '../hooks/useSessions';
import { SessionsScreen } from './SessionsScreen';

jest.mock('../hooks/useSessions');

const mockUseSessions = useSessions as jest.MockedFunction<typeof useSessions>;
const mockRefetch = jest.fn();

const BUTTON_ROLE = 'button';
const RETRY_LABEL = 'Try again';

const SESSION: ActiveSession = {
  id: '5b1f6c0e-2d7a-4c53-8a49-0e6f3d9b7a12',
  createdAt: '2026-09-19T10:00:00.000Z',
  expiresAt: '2026-11-18T10:00:00.000Z',
  ip: '203.0.113.7',
  deviceLabel: 'Chrome on Android',
  startedAt: '2026-09-01T12:00:00.000Z',
};

const givenQuery = (overrides: Record<string, unknown>) => {
  mockUseSessions.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: mockRefetch,
    ...overrides,
  } as never);
};

const renderScreen = async () => render(<SessionsScreen />);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SessionsScreen', () => {
  it('shows a loading indicator while the first answer is pending', async () => {
    givenQuery({ isPending: true });

    await renderScreen();

    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('lists each session with its device and address', async () => {
    givenQuery({ data: [SESSION] });

    await renderScreen();

    expect(screen.getByText('Chrome on Android')).toBeTruthy();
    expect(screen.getByText('203.0.113.7')).toBeTruthy();
    expect(screen.getByText(/^Started /)).toBeTruthy();
  });

  it('falls back to a plain label for a session that never recorded its device or address', async () => {
    givenQuery({ data: [{ ...SESSION, deviceLabel: null, ip: null }] });

    await renderScreen();

    expect(screen.getByText('Unknown device')).toBeTruthy();
    expect(screen.getByText('Unknown address')).toBeTruthy();
  });

  it('offers a retry when loading failed, and runs the query again on press', async () => {
    givenQuery({ isError: true });

    await renderScreen();
    await fireEvent.press(screen.getByRole(BUTTON_ROLE, { name: RETRY_LABEL }));

    expect(screen.getByText('Could not load your sessions.')).toBeTruthy();
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
