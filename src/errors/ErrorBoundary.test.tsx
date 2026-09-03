import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ErrorBoundary } from './ErrorBoundary';

const HEALTHY_TEXT = 'all good';
const RETRY_LABEL = 'Try again';
const FALLBACK_TITLE = 'Something went wrong';

let shouldThrow = true;

const Bomb = () => {
  if (shouldThrow) throw new Error('render exploded');

  return <Text>{HEALTHY_TEXT}</Text>;
};

let consoleError: jest.SpyInstance;

beforeEach(() => {
  shouldThrow = true;
  // React writes every error a boundary catches to console.error. Without this
  // the suite output looks like a failure even when the test passes.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('ErrorBoundary', () => {
  it('renders its children while nothing throws', async () => {
    shouldThrow = false;

    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText(HEALTHY_TEXT)).toBeTruthy();
  });

  it('renders the fallback instead of crashing when a child throws', async () => {
    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText(FALLBACK_TITLE)).toBeTruthy();
    expect(screen.queryByText(HEALTHY_TEXT)).toBeNull();
  });

  it('remounts the subtree when the user retries', async () => {
    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    // Whatever caused the crash has to be gone before retrying, exactly as in
    // the app: the button only remounts, it cannot repair anything.
    shouldThrow = false;
    await fireEvent.press(screen.getByText(RETRY_LABEL));

    expect(await screen.findByText(HEALTHY_TEXT)).toBeTruthy();
  });
});
