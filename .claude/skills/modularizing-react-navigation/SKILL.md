---
name: modularizing-react-navigation
description: Use when a React Native app on React Navigation has, or is growing toward, multiple feature/domain modules and screens keep piling into one flat stack/constants/types file, or when scaffolding navigation for a new multi-module app and deciding how to structure it for scalability.
---

# Modularizing React Navigation

## Overview

A single flat `AppStack.tsx` + `constants.ts` + `types.ts` works for a
handful of screens. Past a few feature modules it becomes a bottleneck:
every screen addition touches the same three shared files, and merge
conflicts pile up across unrelated modules. The fix is to give each
module its own navigator (route constants, param types, stack) and make
the app-level `navigation/` folder a thin composition root that lists
one entry **per module**, never per screen.

## When to Use

- Adding a screen means editing a route file shared by every other
  module (`constants.ts`, `types.ts`, `AppStack.tsx` all growing
  without bound).
- The app is organized by feature module (`src/modules/<name>/`, or
  equivalent) but navigation is not — it's still one central file.
- Starting a new app expected to grow past ~3 feature modules — set
  this up before the flat file exists, not after.

Don't use it for a single-module app or a handful of screens with no
module boundaries — a flat stack is simpler and the split adds
indirection with no payoff yet.

## Core Pattern

Each module owns a `navigation/` folder with its own route constants,
param list, and `Stack.Navigator`. The module's `index.ts` exports only
the stack component and the types/constants other code needs — nothing
else in the app reaches into a module's screens directly. The root
`navigation/` folder composes those per-module stacks into one root
navigator; it never lists a screen, only a module.

```
src/navigation/
  RootNavigator.tsx    # NavigationContainer + RootStack
  RootStack.tsx         # one Stack.Screen per MODULE (stays flat forever)
  constants.ts           # ROOT_ROUTES: one key per module
  types.ts                # RootStackParamList: merges each module's ParamList

src/modules/auth/
  navigation/
    constants.ts          # AUTH_ROUTES: this module's screens only
    types.ts                # AuthStackParamList
    AuthStack.tsx             # createNativeStackNavigator for this module
  screens/
    LoginScreen.tsx
    RegisterScreen.tsx
  index.ts                    # exports AuthStack, AUTH_ROUTES, AuthStackParamList
```

Repeat the `navigation/` trio inside every other module.

## Implementation

Module-level files (auth example):

```ts
// src/modules/auth/navigation/constants.ts
export const AUTH_ROUTES = {
  LOGIN: 'Login',
  REGISTER: 'Register',
  RESET_PASSWORD: 'ResetPassword',
} as const;
export type AuthRoute = (typeof AUTH_ROUTES)[keyof typeof AUTH_ROUTES];
```

```ts
// src/modules/auth/navigation/types.ts
import type { AUTH_ROUTES } from './constants';

export type AuthStackParamList = {
  [AUTH_ROUTES.LOGIN]: undefined;
  [AUTH_ROUTES.REGISTER]: undefined;
  [AUTH_ROUTES.RESET_PASSWORD]: { userId: string };
};
```

Params work exactly as in a flat setup — keyed per route, `undefined`
when the screen takes none. Splitting by module doesn't change that.

```tsx
// src/modules/auth/navigation/AuthStack.tsx
const Stack = createNativeStackNavigator<AuthStackParamList>();

export const AuthStack = () => (
  <Stack.Navigator>
    <Stack.Screen name={AUTH_ROUTES.LOGIN} component={LoginScreen} />
    <Stack.Screen name={AUTH_ROUTES.REGISTER} component={RegisterScreen} />
    <Stack.Screen name={AUTH_ROUTES.RESET_PASSWORD} component={ResetPasswordScreen} />
  </Stack.Navigator>
);
```

Root composition — one entry per module, using `NavigatorScreenParams`
so nested navigation stays type-safe:

```ts
// src/navigation/constants.ts
export const ROOT_ROUTES = {
  AUTH: 'Auth',
  PROFILE: 'Profile',
} as const;
```

```ts
// src/navigation/types.ts
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { AuthStackParamList } from '@/modules/auth';
import type { ProfileStackParamList } from '@/modules/profile';

export type RootStackParamList = {
  [ROOT_ROUTES.AUTH]: NavigatorScreenParams<AuthStackParamList>;
  [ROOT_ROUTES.PROFILE]: NavigatorScreenParams<ProfileStackParamList>;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
```

```tsx
// src/navigation/RootStack.tsx
const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name={ROOT_ROUTES.AUTH} component={AuthStack} />
    <Stack.Screen name={ROOT_ROUTES.PROFILE} component={ProfileStack} />
  </Stack.Navigator>
);
```

Cross-module navigation (module A sending the user into module B) goes
through the root route, then the nested screen — never a direct import
between modules:

```ts
navigation.navigate(ROOT_ROUTES.PROFILE, { screen: PROFILE_ROUTES.EDIT });
```

## Scope Notes

- **Not stack-only.** A module's `navigation/` folder can export any
  navigator type — `WalletTabs` (bottom tabs) or a drawer work the same
  way as `AuthStack`: the root composition only cares that the module
  exports one component and one `ParamList`, not what kind of navigator
  it wraps.
- **Root route key vs. module's internal screens are independent
  names.** `ROOT_ROUTES.WALLET` identifies the module at the root; it
  is unrelated to which of the module's own routes (e.g.
  `WALLET_ROUTES.OVERVIEW`) renders first — that default is decided
  inside the module's own navigator, same as today.
- **Deep-linking config (`linking.ts`) lives in the root `navigation/`
  folder**, next to `RootStack.tsx` — it composes path strings from
  each module's exported route constants, the same way `RootStack.tsx`
  composes their navigators.

## Quick Reference

| Change | Files touched |
|---|---|
| Add a screen to an existing module | that module's `navigation/{constants,types,*Stack}.tsx` only |
| Add a new module | new `src/modules/<name>/navigation/` trio + one line each in root `constants.ts`/`types.ts`/`RootStack.tsx` |
| Navigate within a module | plain `navigation.navigate(MODULE_ROUTES.X)` |
| Navigate across modules | `navigation.navigate(ROOT_ROUTES.MODULE, { screen: MODULE_ROUTES.X })` |

## Common Mistakes

- **Skipping the split until it hurts.** Retrofitting after 6 modules
  means untangling one big `AppStackParamList` union; set the
  per-module trio up when the second module gains its own screens.
- **Letting the root stack list screens instead of modules.** If
  `RootStack.tsx` ever imports a `*Screen` component directly, a
  module's internals leaked past its `navigation/` folder.
- **Importing another module's screens directly for a cross-module
  transition.** Route there through the root's nested params instead —
  direct imports between modules break the module boundary.
- **Forgetting `NavigatorScreenParams` on nested entries.** Without it,
  `navigation.navigate(ROOT_ROUTES.PROFILE, { screen: ... })` won't
  type-check the nested `screen`/`params` shape.
