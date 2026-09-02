import { createContext } from 'react';

import type { AuthContextValue } from './types';

/** Its own file so the provider and the hook can both import it without a cycle. */
export const AuthContext = createContext<AuthContextValue | null>(null);
