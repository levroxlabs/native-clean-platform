/**
 * Wraps an async operation so concurrent callers share one run instead of
 * starting several.
 *
 * The API requires exactly this of `/auth/refresh`: the presented token is
 * spent by the call that uses it, so two concurrent refreshes return two
 * different tokens and only the last one issued stays valid — the client that
 * kept the other is signed out on its next refresh.
 */
export const createSingleFlight = <TResult>(
  run: () => Promise<TResult>,
): (() => Promise<TResult>) => {
  // In the factory's closure, not in the returned function: every call has to
  // see the same slot.
  let inFlight: Promise<TResult> | null = null;

  return (): Promise<TResult> => {
    // Assigned before returning, so a second caller in the same tick finds it.
    // Cleared when the run settles: this shares a run in progress, it does not
    // cache a result — and a refresh token is spent by the call that uses it.
    inFlight ??= run().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
};
