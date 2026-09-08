import type { NavigatorScreenParams } from '@react-navigation/native';

import type { AccountStackParamList, AuthStackParamList } from '@/modules/auth';

/** Routes reachable in the signed-in shell. */
export type AppStackParamList = {
  Home: undefined;
  /**
   * The auth module's own navigator, registered as one screen — a module's
   * internals stop at its navigator, exactly as `RootStack` does.
   */
  Account: NavigatorScreenParams<AccountStackParamList>;
};

/**
 * `NavigatorScreenParams` is what keeps a nested `navigate('App', { screen:
 * 'Home' })` type-checked. Without it the nested `screen` is unchecked.
 */
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  App: NavigatorScreenParams<AppStackParamList>;
};

/**
 * Makes `navigation.navigate()` type-safe anywhere without importing the
 * param lists by hand.
 */
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
