import { act, renderHook } from '@testing-library/react-native';

import { useResendCooldown } from './useResendCooldown';

const COOLDOWN_SECONDS = 60;
const ONE_SECOND_MS = 1000;

/**
 * One second per `act`, because the hook schedules each tick's timer only after
 * the previous tick has rendered. Advancing several seconds inside one `act`
 * fires the single pending timer and no more — which is the hook working, not
 * failing.
 */
const tick = async (times: number) => {
  for (let elapsed = 0; elapsed < times; elapsed += 1) {
    await act(async () => {
      jest.advanceTimersByTime(ONE_SECOND_MS);
    });
  }
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useResendCooldown', () => {
  it('starts at the seconds it was given', async () => {
    const { result } = await renderHook(() => useResendCooldown(COOLDOWN_SECONDS));

    expect(result.current.secondsLeft).toBe(COOLDOWN_SECONDS);
  });

  it('starts ready when it was given none', async () => {
    const { result } = await renderHook(() => useResendCooldown(0));

    expect(result.current.secondsLeft).toBe(0);
  });

  it('counts down one second at a time', async () => {
    const { result } = await renderHook(() => useResendCooldown(COOLDOWN_SECONDS));

    await tick(3);

    expect(result.current.secondsLeft).toBe(COOLDOWN_SECONDS - 3);
  });

  it('stops at zero instead of going negative', async () => {
    const { result } = await renderHook(() => useResendCooldown(2));

    await tick(10);

    expect(result.current.secondsLeft).toBe(0);
  });

  it('restarts on demand, which is what the resend button does', async () => {
    const { result } = await renderHook(() => useResendCooldown(0));

    await act(async () => {
      result.current.restart();
    });

    expect(result.current.secondsLeft).toBe(COOLDOWN_SECONDS);
  });
});
