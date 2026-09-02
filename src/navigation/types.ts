import type { NavigatorScreenParams } from '@react-navigation/native';

import type { AuthStackParamList } from '@/modules/auth';

import type { APP_ROUTES, ROOT_ROUTES } from './constants';

/** Routes reachable in the signed-in shell. */
export type AppStackParamList = {
  [APP_ROUTES.HOME]: undefined;
};

/**
 * `NavigatorScreenParams` is what keeps a nested `navigate(ROOT_ROUTES.APP, {
 * screen: APP_ROUTES.HOME })` type-checked. Without it the nested `screen` is
 * unchecked.
 */
export type RootStackParamList = {
  [ROOT_ROUTES.AUTH]: NavigatorScreenParams<AuthStackParamList>;
  [ROOT_ROUTES.APP]: NavigatorScreenParams<AppStackParamList>;
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
