---
name: modularizing-react-navigation
description: Use when a React Native app on React Navigation has, or is growing toward, multiple feature/domain modules and screens keep piling into one flat stack/constants/types file, or when scaffolding navigation for a new multi-module app and deciding how to structure it for scalability.
---

# Modularizing React Navigation

## Overview

A single flat `AppStack.tsx` + `types.ts` works for a handful of
screens. Past a few feature modules it becomes a bottleneck: every
screen addition touches the same shared files, and merge conflicts pile
up across unrelated modules. The fix is to give each module its own
navigator (param types plus the stack itself) and make
the app-level `navigation/` folder a thin composition root that lists
one entry **per module**, never per screen.

## When to Use

- Adding a screen means editing a route file shared by every other
  module (`types.ts` and `AppStack.tsx` growing without bound).
- The app is organized by feature module (`src/modules/<name>/`, or
  equivalent) but navigation is not — it's still one central file.
- Starting a new app expected to grow past ~3 feature modules — set
  this up before the flat file exists, not after.

Don't use it for a single-module app or a handful of screens with no
module boundaries — a flat stack is simpler and the split adds
indirection with no payoff yet.

## Core Pattern

Each module owns a `navigation/` folder with its own param list and
`Stack.Navigator`. The module's `index.ts` exports only the stack
component and the types other code needs — nothing else in the app
reaches into a module's screens directly. The root
`navigation/` folder composes those per-module stacks into one root
navigator; it never lists a screen, only a module.

```
src/navigation/
  RootNavigator.tsx    # NavigationContainer + RootStack
  RootStack.tsx         # one Stack.Screen per MODULE (stays flat forever)
  types.ts                # RootStackParamList: merges each module's ParamList

src/modules/auth/
  navigation/
    types.ts                # AuthStackParamList — declares this module's route names
    AuthStack.tsx             # createNativeStackNavigator for this module
  screens/
    LoginScreen.tsx
    RegisterScreen.tsx
  index.ts                    # exports AuthStack, AuthStackParamList
```

Repeat the `navigation/` pair inside every other module.

**Route names are literals, not a constants object.** The param list is
already the single declaration of every name in the module, and `tsc`
rejects any `name` or `navigate()` argument missing from it. A parallel
`AUTH_ROUTES` object would be a second source for the same truth and
buys no extra checking. Note that the PascalCase keys this produces may
trip a naming-convention lint rule on type properties — scope an
exception to `**/navigation/types.ts` rather than renaming routes.

## Implementation

Module-level files (auth example):

```ts
// src/modules/auth/navigation/types.ts
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ResetPassword: { userId: string };
};
```

Params work exactly as in a flat setup — keyed per route, `undefined`
when the screen takes none. Splitting by module doesn't change that.

```tsx
// src/modules/auth/navigation/AuthStack.tsx
const Stack = createNativeStackNavigator<AuthStackParamList>();

export const AuthStack = () => (
  <Stack.Navigator>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
    <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
  </Stack.Navigator>
);
```

Root composition — one entry per module, using `NavigatorScreenParams`
so nested navigation stays type-safe:

```ts
// src/navigation/types.ts
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { AuthStackParamList } from '@/modules/auth';
import type { ProfileStackParamList } from '@/modules/profile';

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
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
    <Stack.Screen name="Auth" component={AuthStack} />
    <Stack.Screen name="Profile" component={ProfileStack} />
  </Stack.Navigator>
);
```

Cross-module navigation (module A sending the user into module B) goes
through the root route, then the nested screen — never a direct import
between modules:

```ts
navigation.navigate('Profile', { screen: 'Edit' });
```

## Scope Notes

- **Not stack-only.** A module's `navigation/` folder can export any
  navigator type — `WalletTabs` (bottom tabs) or a drawer work the same
  way as `AuthStack`: the root composition only cares that the module
  exports one component and one `ParamList`, not what kind of navigator
  it wraps.
- **Root route key vs. module's internal screens are independent
  names.** `'Wallet'` identifies the module at the root; it is
  unrelated to which of the module's own routes (e.g. `'Overview'`)
  renders first — that default is decided inside the module's own
  navigator, same as today.
- **Deep-linking config (`linking.ts`) lives in the root `navigation/`
  folder**, next to `RootStack.tsx` — it composes path strings against
  each module's `ParamList`, the same way `RootStack.tsx` composes
  their navigators.

## Quick Reference

| Change | Files touched |
|---|---|
| Add a screen to an existing module | that module's `navigation/{types,*Stack}.tsx` only |
| Add a new module | new `src/modules/<name>/navigation/` pair + one line each in root `types.ts`/`RootStack.tsx` |
| Navigate within a module | plain `navigation.navigate('ScreenName')` |
| Navigate across modules | `navigation.navigate('Module', { screen: 'ScreenName' })` |

## Common Mistakes

- **Skipping the split until it hurts.** Retrofitting after 6 modules
  means untangling one big `AppStackParamList` union; set the
  per-module pair up when the second module gains its own screens.
- **Letting the root stack list screens instead of modules.** If
  `RootStack.tsx` ever imports a `*Screen` component directly, a
  module's internals leaked past its `navigation/` folder.
- **Importing another module's screens directly for a cross-module
  transition.** Route there through the root's nested params instead —
  direct imports between modules break the module boundary.
- **Forgetting `NavigatorScreenParams` on nested entries.** Without it,
  `navigation.navigate('Profile', { screen: ... })` won't type-check
  the nested `screen`/`params` shape.
