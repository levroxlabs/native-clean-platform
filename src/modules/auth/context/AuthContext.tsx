import { createContext, type PropsWithChildren, useMemo } from 'react';

import { useAuthActions } from '../hooks/useAuthActions';
import { useAuthSession } from '../hooks/useAuthSession';
import type { AuthContextValue } from '../types';

/**
 * Lives with its provider rather than in a file of its own: only `useAuth`
 * reads it, and the provider is the only thing that can fill it. A second
 * context in this module gets its own file in this folder.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Composition, and nothing else. `useAuthSession` decides whether there IS a
 * session; `useAuthActions` is what a user can do to one.
 */
export const AuthProvider = ({ children }: PropsWithChildren) => {
  const session = useAuthSession();
  const actions = useAuthActions(session);

  const value = useMemo<AuthContextValue>(
    () => ({ status: session.status, user: session.user, ...actions }),
    [session.status, session.user, actions],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
