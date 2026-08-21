# Maestro E2E setup

**Date:** 2026-08-21
**Status:** Approved

## Goal

Establish the E2E testing convention for this boilerplate: build target,
flow location, and documentation, so that every project cloning this repo —
and every module added to it — has a ready-made pattern to write Maestro
flows against. This is infrastructure and convention only, not a push for
flow coverage: the app currently has just a single `Home` screen and no
auth backend yet (backend lives in a separate repo, not ready).

## Scope

- Build target, folder layout, npm scripts, and documentation for Maestro.
- Not covered: actual test flows (`.maestro/*.yaml`), CI wiring, `testID`
  additions to existing components.

## Decision

Use **Maestro** as the E2E tool, targeting an **Expo dev client build**
(`expo-dev-client` + `expo run:ios` / `expo run:android`), not Expo Go and
not an EAS cloud build.

**Why Maestro over Detox:** simpler setup (no native instrumentation step,
declarative YAML flows), and it is Expo's own currently recommended E2E tool
— a better fit for a template meant to be cloned by people without deep RN
native tooling experience.

**Why dev client over Expo Go:** this repo is a template other projects
clone and add native modules to over time. Expo Go stops working the moment
a module needs custom native code; a dev client build does not. Setting up
dev client now avoids a forced migration later, for the cost of one local
prebuild step today. `.gitignore` already treats `/ios` and `/android` as
generated output, so this fits the existing (if unused until now) prebuild
convention.

**Why local build over EAS:** no `eas.json` or Expo account exists in this
template today. `expo run:ios` / `expo run:android` produce a local dev
client build without requiring either, keeping the template account-free.
EAS can be layered in later by whichever project needs cloud builds — out of
scope here.

**Alternative considered:** Detox. Deeper JS-thread/UI synchronization
(reduces flakiness on complex interactions), but requires native
instrumentation and is noticeably heavier to set up with Expo managed
projects. Rejected for this template in favor of Maestro's lower setup cost.

## Design

### 1. Dependencies (`package.json`)

- `devDependencies`: add `expo-dev-client`.
- Maestro CLI itself is **not** an npm package — it is a standalone binary
  installed via its own install script. Documented in `.maestro/README.md`,
  not added as a project dependency.

### 2. Scripts (`package.json`)

- `"e2e:build:ios": "expo run:ios"` — prebuilds and installs a dev client on
  the iOS simulator.
- `"e2e:build:android": "expo run:android"` — same for Android emulator.
- `"test:e2e": "maestro test .maestro"` — runs all flows in `.maestro/`
  against whichever simulator/emulator/device is currently running the dev
  client.

### 3. Folder layout

- `.maestro/` at repo root — Maestro's default flow-discovery location, kept
  outside `src/` since it is not app code and doesn't belong to any module
  (matches Rule 5: `src/` stays organized by module, tooling config lives
  at root like `biome.json`, `metro.config.js`).
- No `.yaml` flow files yet — folder holds only `.maestro/README.md` for now.

### 4. Element selection convention

Maestro selects elements primarily by visible text or `testID`. The app has
no `testID`s today. Rather than adding them speculatively, the convention is
documented in `.maestro/README.md`: when a flow needs to target an element
ambiguously (icon buttons, repeated text), add a `testID` constant on that
component, following the existing AGENTS.md Rule 4 guidance (test IDs are
already listed as a "must extract into a constant" case — this just makes
that guidance actionable for the first time).

### 5. Documentation

- `.maestro/README.md` (Portuguese prose, English identifiers/paths, per
  AGENTS.md Rule 3 carve-out): prerequisites (Maestro CLI install, Xcode /
  Android Studio), how to build the dev client, how to run flows, the
  `testID` selection convention, and flow file naming once flows exist.
- `README.md` (root): add `.maestro/` to the folder map, add
  `e2e:build:ios` / `e2e:build:android` / `test:e2e` to the commands list.
- `AGENTS.md`: replace the "No Detox/Maestro (E2E) yet." line in Rule 8 with
  the actual convention (tool, dev client requirement, `.maestro/` location,
  `testID` selection rule).

## Verification

This environment (WSL2) has no Xcode, Android SDK, or Maestro CLI installed,
so the actual dev-client build and `maestro test` run cannot be executed
here. What can be verified in this environment:

- `pnpm install` — confirms `expo-dev-client` resolves.
- `pnpm typecheck` and `pnpm lint` — confirm no regressions from the
  `package.json` / doc changes.

Building the dev client and running a real flow is left for local/CI
verification outside this session.

## Out of scope / explicitly deferred

- Writing actual `.maestro/*.yaml` flows — deferred until there are more
  screens/flows worth covering (see Goal). No smoke-test flow is included,
  by explicit choice, since there is nothing meaningful to assert yet beyond
  what unit tests already cover.
- Adding `testID`s to existing components — deferred to whoever writes the
  first real flow.
- CI integration (GitHub Actions) — deferred; no CI workflow exists in this
  repo yet at all.
- EAS / cloud builds — deferred to whichever project built from this
  template actually needs them.
