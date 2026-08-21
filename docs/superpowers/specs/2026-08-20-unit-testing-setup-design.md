# Unit testing setup

**Date:** 2026-08-20
**Status:** Approved

## Goal

Establish the unit testing convention for this boilerplate: the test runner,
config, file layout, and documentation, so that every project cloning this
repo — and every module added to it — has a ready-made, low-friction pattern
to write tests against. This is infrastructure and convention, not a push for
test coverage of the (currently minimal) existing code.

## Scope

- Pure logic (utils, hooks, module logic) **and** components/screens.
- Not covered: end-to-end tests, visual regression, CI pipeline wiring beyond
  a `pnpm test` script.

## Decision

Use **jest-expo** (Expo's official Jest preset) with
**@testing-library/react-native** for components. This is the setup
documented at https://docs.expo.dev/develop/unit-testing/, works with React
19 and RN 0.86, and requires no hand-rolled mocks for Expo/RN native modules.

**Alternative considered:** Vitest with manual RN mocks. Faster test runs,
but no official React Native preset — would require hand-maintaining mocks
for Reanimated, Gesture Handler, and Expo native modules, a maintenance risk
for a boilerplate that gets cloned and upgraded across Expo SDKs. Rejected.

## Design

### 1. Dependencies and config (`package.json`)

- `devDependencies`: `jest-expo`, `jest`, `@types/jest`,
  `@testing-library/react-native`.
- Scripts: `"test": "jest --watchAll"`, `"test:ci": "jest --ci"`.
- `"jest"` block: `"preset": "jest-expo"`, with
  `setupFiles: ["react-native-gesture-handler/jestSetup"]` so gesture-handler
  native calls don't throw in tests. Reanimated and Safe Area Context ship
  their own Jest-safe entry points and need no extra setup file.
- `pnpm test` stays **separate** from `pnpm check` (typecheck + lint stay the
  fast pre-commit gate; testing is run on demand or in CI).

### 2. File convention

Tests are **colocated** next to the file they test (`Button.tsx` +
`Button.test.tsx`), never in a `__tests__/` folder — this matches Rule 5 of
`AGENTS.md` (module-based structure, not file-type-based). Suffix is
`.test.ts` / `.test.tsx`. Test code follows every other AGENTS.md rule:
English only, arrow functions, no magic strings/numbers (with the Biome
exception below).

### 3. What to test

- Pure logic (`src/utils/`, module logic, hooks): plain Jest, `describe`/`it`/`expect`.
- Components/screens: React Native Testing Library, asserting on
  user-observable behavior (rendered text, `fireEvent` interactions) —
  **not** snapshot tests, per Expo's current testing guidance.

### 4. Biome

Test files assert against literal values constantly
(`expect(sum(2, 2)).toBe(4)`), which conflicts with the project's
`noMagicNumbers` rule. Add a `biome.json` override disabling
`style.noMagicNumbers` for `**/*.test.ts` and `**/*.test.tsx` only — every
other rule (arrow-function components, naming convention, etc.) still
applies to test files.

### 5. Documentation

- `AGENTS.md`: new "8. Tests" section documenting the convention above
  (runner, colocation, what to test, the Biome exception).
- `README.md`: add `pnpm test` / `pnpm test:ci` to the commands list, and
  note the testing setup in the roadmap.
- No per-module README changes yet — there are no modules under
  `src/modules/` today; the module README template (Rule 3) already has
  space for documenting test coverage per module when one exists.

## Out of scope / explicitly deferred

- Writing tests for existing code (`cn()`, tokens, `RootNavigator`) is not
  required by this change — the goal is the convention, not coverage. A
  minimal example test (for `cn()`) is included only to prove the setup
  works end-to-end, not as a coverage push.
- E2E testing (Detox/Maestro) — not discussed, not part of this spec.
- Folding `pnpm test` into `pnpm check` — explicitly rejected for now, can be
  revisited once the project has enough real tests to make that gate useful.
