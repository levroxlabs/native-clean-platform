import type { APP_ROUTES } from './constants';

/** Routes reachable in the app. */
export type AppStackParamList = {
  [APP_ROUTES.HOME]: undefined;
};

/**
 * Makes `navigation.navigate()` type-safe anywhere without importing the
 * param lists by hand.
 */
declare global {
  namespace ReactNavigation {
    interface RootParamList extends AppStackParamList {}
  }
}
