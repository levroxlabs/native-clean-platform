/** Every route name in the app. Adding a screen starts here. */
export const APP_ROUTES = {
  HOME: 'Home',
} as const;

export type AppRoute = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];
