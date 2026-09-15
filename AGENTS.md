# Project Conventions

Read this before writing any code in this repository.

**This file is about *how* to write code** — naming, structure, style,
testing conventions — and, in [Rule 9](#9-model-escalation), when to stop coding
and escalate. **For *what already exists*** — the folder tree, the
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

---

## 9. Model escalation

Applies only when the session model is **not** Opus (check the model named in your
system prompt). On Opus, ignore this section entirely.

Stop and escalate as soon as **any** of these is true — they are counts, not
judgment calls, so do not wait to "feel" stuck:

- The same test or error has survived **3** consecutive fix attempts without the
  error message changing.
- You have rewritten or reverted **the same file 2 times** in the same task.
- You have run the same command **4+ times** with the same failure.
- The user has corrected you **twice on the same point**.

When a trigger fires:

1. **Stop.** Do not attempt a fourth fix, and do not switch to a different angle
   on the same problem — the budget for this model on this task is spent.
2. Say which trigger fired and what the last known-good state is.
3. Offer the two escalation paths and wait: the user runs `/model opus` to
   continue in this session, or you dispatch the `opus-escalation` agent
   (`.claude/agents/opus-escalation.md`) with a written handoff (failing
   command, exact error, what was already tried and ruled out, files touched).

Never silently continue past a trigger, and never claim the problem is "almost
solved" as a reason to keep going — that is the rationalization this rule exists
to catch.

---

## 10. Comments

A comment exists to carry a **WHY** the code cannot say on its own — never to
restate a **WHAT** the code and its names already say. Add one only when it
teaches something a careful reader would not otherwise get: a non-obvious
constraint, an invariant, a trade-off, a fact about an external system (the
API, a library, a platform), or the reason a simpler approach was rejected.

```ts
// Bad — restates the code
// increments the retry counter
retryCount += 1;

// Good — the code alone can't tell you this
// Retries after the original call, so this is one retry in total, not two.
const MAX_RETRY_ATTEMPTS = 1;
```

- If deleting the comment loses no information a reader needs, delete it.
- One clause is usually enough. A comment earns a second sentence only when
  the reasoning genuinely needs it — reach for a full paragraph rarely, and
  never as a place to restate the signature or repeat the variable name.
- Don't paste the same explanation at every call site. When one non-obvious
  fact justifies a pattern repeated across files, write it once — next to the
  export it belongs to, or in the module's `README.md` — and leave the other
  sites either uncommented or pointing back in a few words, not the full
  explanation again.
- A comment that no longer matches the code it sits above is worse than no
  comment at all. Update or delete it in the same change that changes the
  code — don't leave it for someone else to notice it lied.

This is not machine-checked: Biome has no rule for comment quality, so hold
the line in review, the same way [Rule 2](#2-arrow-functions-everywhere) holds
the line on `function` declarations.

---

## 11. Promises in event handlers and effects

Never write `.then()`/`.catch()`. Use `async`/`await` with `try`/`catch`.

When a call is fire-and-forget — the caller does not need the result and
nothing downstream depends on it resolving — call it directly, with no
`void`:

```tsx
// Good
onPress={() => signOut()}

// Bad
onPress={() => void signOut()}
```

`biome.json` has no rule in this project that flags an unhandled promise, so
there is nothing to silence — `void` here would only be decoration, not a
tool requirement. The same applies inside `useEffect`: the effect callback
itself cannot be `async`, so define the async function inside it and call it
without `void`.

When a rejection needs to reach something — a toast, a form error, a retry —
wrap the call in an `async` function and handle it with `try`/`catch`. Name it
and pass it by reference rather than inlining it — see
[Rule 13](#13-extracting-handlers-from-jsx-props):

```tsx
// Good
const handleSignOutEverywhere = async () => {
  try {
    await signOutEverywhere();
  } catch (error) {
    showError(error);
  }
};

onPress={handleSignOutEverywhere}

// Bad
onPress={() => {
  void signOutEverywhere().catch(showError);
}}
```

This is not machine-checked — hold the line in review, the same way
[Rule 2](#2-arrow-functions-everywhere) holds the line on `function`
declarations.

---

## 12. Block-bodied `if` statements

Every `if` (and `else`) always uses a block body, even for a single
statement:

```ts
// Good
if (value === null) {
  throw new Error(MISSING_PROVIDER_MESSAGE);
}

// Bad
if (value === null) throw new Error(MISSING_PROVIDER_MESSAGE);
```

More lines in some cases, but every statement then reads at the same scan
speed — nothing is hiding on the condition's own line.

Machine-checked by Biome's `style.useBlockStatements`. Biome marks its own fix
as unsafe (wrapping a statement in a block can shift `var` hoisting, which
this codebase never relies on), so apply it with
`biome check --write --unsafe .` rather than the plain `pnpm lint:fix`.

---

## 13. Extracting handlers from JSX props

Prefer a named function over an inline arrow when the handler holds more than
one statement, or logic worth naming on its own:

```tsx
// Good
const handleSignOutEverywhere = async () => {
  try {
    await signOutEverywhere();
  } catch (error) {
    showError(error);
  }
};

<Pressable onPress={handleSignOutEverywhere}>

// Also fine — one expression, nothing to name
<Pressable onPress={() => signOut()}>
```

This is a default to lean on, not an absolute — balance it against the
surrounding code as you write it. A handler that is a single call or
expression (`() => signOut()`, `() => navigation.navigate('ChangePassword')`)
reads fine inline; a `try`/`catch`, more than one statement, or anything that
would otherwise carry a comment is worth pulling out and naming. Not
machine-checked — hold the line in review.
