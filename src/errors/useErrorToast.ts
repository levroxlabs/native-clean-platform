import { useContext } from 'react';

import { ErrorToastContext, type ErrorToastValue } from './ErrorToast';

const MISSING_PROVIDER_MESSAGE = 'useErrorToast was called outside of <ErrorToastProvider>.';

/**
 * Throws rather than returning a no-op: a missing provider would mean errors
 * disappearing silently, which is the exact failure this layer exists to end.
 */
export const useErrorToast = (): ErrorToastValue => {
  const value = useContext(ErrorToastContext);

  if (value === null) throw new Error(MISSING_PROVIDER_MESSAGE);

  return value;
};
