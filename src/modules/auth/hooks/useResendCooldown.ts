import { useCallback, useEffect, useState } from 'react';

/** Mirrors the API's own resend cooldown, which is per account. */
export const RESEND_COOLDOWN_SECONDS = 60;

const ONE_SECOND_MS = 1000;
const READY = 0;

/**
 * A countdown that gates a resend button.
 *
 * The hook owns the counting and nothing else. WHEN to restart is the caller's
 * decision — see `VerifyEmailScreen`, which restarts on a resolved resend
 * without asking whether the API actually sent anything: a resend inside the
 * server's own cooldown answers 202 and sends nothing, indistinguishable from
 * one that worked.
 *
 * One `setTimeout` per tick rather than a single `setInterval`: the effect
 * re-runs on each value, so the cleanup cancels exactly one pending timer and
 * an unmount mid-countdown leaves nothing behind.
 */
export const useResendCooldown = (initialSeconds: number) => {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (secondsLeft === READY) return;

    const timer = setTimeout(() => setSecondsLeft((current) => current - 1), ONE_SECOND_MS);

    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const restart = useCallback(() => setSecondsLeft(RESEND_COOLDOWN_SECONDS), []);

  return { secondsLeft, restart };
};
