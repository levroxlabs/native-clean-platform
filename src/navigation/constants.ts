/** Every route name in the app. Adding a screen starts here. */
export const APP_ROUTES = {
  HOME: 'Home',
} as const;

export type AppRoute = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];

/** One key per module, plus the signed-in shell. Screens never appear here. */
export const ROOT_ROUTES = {
  AUTH: 'Auth',
  APP: 'App',
} as const;

export type RootRoute = (typeof ROOT_ROUTES)[keyof typeof ROOT_ROUTES];
