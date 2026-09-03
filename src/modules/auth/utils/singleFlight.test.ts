import { createSingleFlight } from './singleFlight';

const FIRST_RESULT = 'token-1';
const SECOND_RESULT = 'token-2';
const FAILURE_MESSAGE = 'the refresh failed';

/** A promise the test settles by hand, so two callers can overlap on purpose. */
const deferred = <TResult>() => {
  let resolve!: (value: TResult) => void;
  let reject!: (reason: unknown) => void;

  const promise = new Promise<TResult>((resolveIt, rejectIt) => {
    resolve = resolveIt;
    reject = rejectIt;
  });

  return { promise, resolve, reject };
};

describe('createSingleFlight', () => {
  it('runs the work once while a call is in flight, and answers both callers', async () => {
    const pending = deferred<string>();
    const run = jest.fn(() => pending.promise);
    const call = createSingleFlight(run);

    const first = call();
    const second = call();
    pending.resolve(FIRST_RESULT);

    await expect(first).resolves.toBe(FIRST_RESULT);
    await expect(second).resolves.toBe(FIRST_RESULT);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh run once the previous one has settled', async () => {
    // It shares a run in progress; it does not cache a result. A refresh token
    // is spent by the call that uses it, so a cached answer would be poison.
    const run = jest
      .fn<Promise<string>, []>()
      .mockResolvedValueOnce(FIRST_RESULT)
      .mockResolvedValueOnce(SECOND_RESULT);
    const call = createSingleFlight(run);

    await expect(call()).resolves.toBe(FIRST_RESULT);
    await expect(call()).resolves.toBe(SECOND_RESULT);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('delivers the same rejection to every caller waiting on the run', async () => {
    const pending = deferred<string>();
    const call = createSingleFlight(() => pending.promise);

    // Both handlers are attached BEFORE the rejection, so neither call is
    // briefly unhandled — which Node reports as a warning and Jest can fail on.
    const settled = Promise.all([
      call().catch((error: unknown) => error),
      call().catch((error: unknown) => error),
    ]);

    pending.reject(new Error(FAILURE_MESSAGE));

    const [firstError, secondError] = await settled;

    expect(firstError).toBeInstanceOf(Error);
    expect(firstError).toBe(secondError);
  });
});
