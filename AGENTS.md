# Project Conventions

Read this before writing any code in this repository.

**This file is about *how* to write code** — naming, structure, style,
testing conventions. **For *what already exists*** — the folder tree, the
module-boundary rules, the design-token pipeline, navigation, and which
technical decisions are locked in and why — see
**[ARCHITECTURE.md](ARCHITECTURE.md)**.

**Scope: front-end only.** The backend this app authenticates against lives in a
separate repository. Never add server, database, or token-issuing code here.

> **Expo has changed.** Check the exact versioned docs at
> https://docs.expo.dev/versions/v57.0.0/ before using an Expo API.

---

## 1. English only

All code is written in English — comments, JSDoc, function names, component
names, variable names, constants, type names, file names, and commit messages.
No exceptions, including for user-facing copy in this boilerplate.

The one exception is `README.md` files — see [Rule 3](#3-module-readme):
their prose is written in Portuguese, while any code sample inside them
(identifiers, imports, folder trees) stays in English like the rest of the
codebase.

## 2. Arrow functions everywhere

Every function and every component is an arrow function assigned to a `const`.
Never use `function` declarations or `function` expressions.

```tsx
// Good
export const Button = ({ label }: ButtonProps) => <Text>{label}</Text>;
export const formatCurrency = (value: number): string => { /* ... */ };

// Bad
export function Button({ label }: ButtonProps) { /* ... */ }
```

Biome enforces this for components (`useReactFunctionComponentDefinition`) and
for function expressions (`useArrowFunction`). Plain function declarations are
not machine-checked — hold the line in review.

Two exceptions, both because `instanceof` or React itself requires a class:
`ApiError` in `src/lib/api.ts`, and `ErrorBoundary` in `src/errors/`, whose
`getDerivedStateFromError` has no hook equivalent in any released React.

## 3. Module README

Every module (each folder under `src/`, and each module under `src/modules/`)
has a `README.md` that acts as its simplified documentation. It must list what
the module exports and what each export is for.

**Write README prose in Portuguese** — headings, descriptions, table cells,
everything except code identifiers and folder/file names, which stay in
English (they must match the actual code). This is the one carve-out from
[Rule 1](#1-english-only). Section headings (`## Components`, `## Hooks`,
`## Functions`, `## Constants`, `## Conventions`) may stay in English too,
since they are the structural labels a reader scans for across every module.

```md
# <Module name>

One paragraph: what this module is responsible for, and what it is not.

## Components
| Name | Description |
## Hooks
| Name | Description |
## Functions
| Name | Description |
## Constants
| Name | Description |

## Conventions
Anything specific to this module.
```

Omit sections that do not apply. **Update the README in the same change that
adds, removes, or renames an export** — a stale README is worse than none.

## 4. No magic strings or numbers

Never inline a bare string or number that carries meaning. Extract it into a
named constant, or a `const` object with `as const` when the values form a
closed set of options.

- Names are `UPPER_SNAKE_CASE` for primitives, and descriptive: include the unit
  (`REQUEST_TIMEOUT_MS`, `MAX_AVATAR_SIZE_BYTES`), not just `TIMEOUT`.
- Closed sets use a `const` object plus a derived union type — not a TS `enum`,
  which does not erase cleanly and adds runtime weight:

  ```ts
  export const AUTH_STATUSES = { LOADING: 'loading', SIGNED_IN: 'signedIn' } as const;
  export type AuthStatus = (typeof AUTH_STATUSES)[keyof typeof AUTH_STATUSES];
  ```

- Keep a constant next to where it is used. Promote it to the module's
  `constants.ts` only when more than one file in that module needs it, and to a
  shared location only when more than one module needs it.

### What this means on the front-end specifically

| Extract into a constant                                                 | Leave inline                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------- |
| Storage keys, header names, HTTP status codes                            | Tailwind class strings in `className` — that is the styling language, not data |
| User-facing copy (labels, titles, error messages) — see below            | `0`, `1`, `-1` used as identity, empty, or "not found"   |
| Animation durations, debounce delays, retry counts, timeouts, page sizes | `flex: 1` and equivalents in a `StyleSheet`              |
| Layout values used outside Tailwind (`hitSlop`, `snapToInterval`)        | Numbers that are already inside a named token in `src/theme/tokens.js` |
| Test IDs and accessibility identifiers                                  | **Route names** — write `<Stack.Screen name="SignIn">` and `navigate('SignIn')`. The param list in `types.ts` is the single declaration, and `tsc` rejects a name that is not in it |
|                                                                          | **API paths** — write `request('/auth/login', …)`. The path appears once, in the function that owns that endpoint |

**User-facing copy** lives in a `COPY` object per screen or component, colocated
with it. This keeps the JSX readable and gives i18n a single seam to replace
later:

```tsx
const COPY = {
  title: 'Welcome back',
  submitLabel: 'Sign in',
} as const;
```

**Design values** — spacing, color, radius, font size — are never constants in a
component. They come from `src/theme/tokens.js` through Tailwind classes.

Biome's `noMagicNumbers` catches numeric violations — note that it correctly
allows `const REQUEST_TIMEOUT_MS = 5000`, since naming the value *is* the fix.
String violations are not machine-checked; catch them in review.

---

## 5. Structure

Organised **by module, not by file type**. See [README.md](README.md) for the
folder map.

- The `@/` alias points at `src/`. Never write `../../`.
- Nothing imports a file inside a module — only what the module's `index.ts`
  exports.
- A component moves out of `modules/<x>/` into `src/components/` only once a
  second module needs it.
- `src/lib/` knows nothing about React. Hooks and Contexts live in
  `src/hooks/` or inside the module that owns them — a module's contexts go in
  its own `context/` folder, and its form schemas in `validations/`.

See [ARCHITECTURE.md](ARCHITECTURE.md), section 2, for the full folder tree
as it exists today and the module-boundary table.

## 6. Styling

NativeWind classes only. No `StyleSheet.create` and no inline style objects
unless an API forces it (for example `contentContainerStyle` on a list, or the
root `flex: 1` on `GestureHandlerRootView`).

Prefer the semantic colour aliases (`bg-background`, `text-content-muted`,
`bg-primary`) over raw scales (`bg-neutral-50`, `bg-brand-500`), so dark mode and
rebranding stay in one place.

## 7. Tooling

Biome is the only linter and formatter — there is no ESLint, no Prettier, and no
EditorConfig in this repo. pnpm is the only package manager.

```bash
pnpm check       # typecheck + lint, run before every commit
pnpm lint:fix    # apply safe fixes
```

pnpm settings live in `pnpm-workspace.yaml`, not `.npmrc` — pnpm 11 no longer
reads `.npmrc`. `nodeLinker: hoisted` is required: Metro cannot resolve through
pnpm's symlinked `node_modules`.

Three deliberate exceptions in `biome.json`:

- `useNamingConvention` is off for `src/theme/tokens.js`. Keys like `0.5`,
  `2xl`, and `DEFAULT` are dictated by Tailwind, not chosen by us.
- `noUnknownAtRules` is off for `.css` files, because `@tailwind` is not a
  standard at-rule.
- `useNamingConvention` allows PascalCase `typeProperty` in `**/navigation/types.ts`.
  Route names are PascalCase by React Navigation convention, and since they are
  written inline (see [Rule 4](#4-no-magic-strings-or-numbers)) the param list
  declares them as literal keys — `Home: undefined`, not `[APP_ROUTES.HOME]`.
  The names come from the library's convention, not from us.

Class sorting is not enforced: Biome's `useSortedClasses` is still a work in
progress and does not understand custom utilities, so it would fight our tokens.

## 8. Tests

Tests use **jest-expo** (Jest, configured for Expo/React Native) plus
**React Native Testing Library** for components, and **Maestro** for E2E
flows against a dev client build.

- Tests are **colocated** next to the file they test — `Button.tsx` +
  `Button.test.tsx` — never in a `__tests__/` folder, matching the
  module-based structure from [Rule 5](#5-structure). The `.test.ts`/
  `.test.tsx` suffix is required, not just a naming preference: it is
  exactly what the Biome override below matches on, so anything named
  differently (`.spec.tsx`, files under `__tests__/`) still runs as a test
  but silently loses the `noMagicNumbers` exemption and fails `pnpm lint`.
- Pure logic (`src/utils/`, hooks, module logic) is tested with plain Jest:
  `describe`/`it`/`expect`.
- Components and screens are tested with `@testing-library/react-native`,
  asserting on user-observable behavior — rendered text, accessibility
  state, `fireEvent` interactions. Never snapshot tests. In the installed
  version, `render()` and `fireEvent.*()` return Promises and must be
  `await`ed — omitting `await` produces a confusing failure later in the
  test rather than an obvious error at the call site.
- Test files are exempt from Biome's `noMagicNumbers` (see the
  `**/*.test.ts`/`**/*.test.tsx` override in `biome.json`) since assertions
  compare against literal values by design. Every other rule still applies.

```bash
pnpm test       # jest --watchAll
pnpm test:ci    # jest --ci
```

`pnpm test` is intentionally **not** part of `pnpm check` — typecheck and
lint stay the fast pre-commit gate; run tests on demand or in CI.

### E2E (Maestro)

Flows live in `.maestro/` at the repo root — Maestro's default discovery
location, kept outside `src/` since it isn't module code (same reasoning as
`biome.json` or `metro.config.js` living at root). See
[`.maestro/README.md`](.maestro/README.md) for prerequisites, how to build
the dev client, and how to run flows.

- Maestro requires a **dev client build** (`expo-dev-client`), not Expo Go —
  once any module adds custom native code, Expo Go stops working for E2E
  while the dev client keeps working.
- Elements are selected by visible text or `testID`. Add a `testID` constant
  (see [Rule 4](#4-no-magic-strings-or-numbers)) only when text selection is
  ambiguous (icon buttons, repeated text) — don't add them speculatively.

```bash
pnpm e2e:build:ios      # build + install the dev client on the iOS simulator
pnpm e2e:build:android  # build + install the dev client on the Android emulator
pnpm test:e2e           # run every flow in .maestro/ against the installed dev client
```

No flows exist yet — the app currently has only a single `Home` screen
and no auth backend to test against.
