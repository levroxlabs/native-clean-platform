import { useContext } from 'react';

import { AuthContext } from '../AuthContext';
import type { AuthContextValue } from '../types';

const MISSING_PROVIDER_MESSAGE = 'useAuth was called outside of <AuthProvider>.';

/**
 * Throws rather than returning a signed-out value: a missing provider is a
 * wiring mistake, and reading as "signed out" would hide it behind a login
 * screen that can never succeed.
 */
export const useAuth = (): AuthContextValue => {
  const value = useContext(AuthContext);

  if (value === null) throw new Error(MISSING_PROVIDER_MESSAGE);

  return value;
};
