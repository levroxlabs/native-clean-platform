# Error layer

**Date:** 2026-09-02
**Status:** Approved

## Goal

Give this boilerplate one answer to "what happens when something fails" —
covering the three gaps that exist today: a render exception takes down the
whole app, an error with no owning screen is invisible, and only `auth` knows
how to turn an error code into a sentence a user can read.

The target is a **small, complete seam**, not a framework. Every app cloned
from this repo should be able to change how errors look by editing Tailwind
classes, and change what they say by editing one map.

## Scope

In:

- A render error boundary, so an exception during render stops at a fallback
  screen instead of killing the app.
- A global toast for errors that no screen owns — a background query failure,
  a lost connection.
- One shared `code` → copy map, extended per module, replacing the
  auth-only `errorCopy.ts`.
- Error classification driving a retry policy, plus real connectivity
  detection so TanStack Query knows when the device is offline.

Out (see the last section for the full list): telemetry of any kind.

## Decisions

### D1 — `src/errors/` as its own top-level folder

The layer lives in one flat folder — like `theme/`, `utils/` and `lib/`, not
like `src/modules/<x>/`, so it gets no `context/` or `hooks/` subfolders.

Splitting it by folder semantics instead (pure logic in `utils/`, UI in
`components/`, the context in `hooks/`) was rejected: it scatters one concern
across three folders and three READMEs, and this repo is cloned by people who
need "where do I change how errors appear" to have a one-word answer.

**Dependency direction:** `errors/` imports from `lib/` (it needs `ApiError`
and `API_ERROR_CODES`). Never the reverse. Connectivity detection therefore
lives in `lib/`, not in `errors/` — watching the network is I/O, and putting it
in `errors/` would make the two top-level folders circular.

### D2 — Our own toast component, no library

`react-native-reanimated` and `react-native-safe-area-context` are already
dependencies, and `SafeAreaProvider` is already mounted — so two of the four
things a toast library provides (animation, safe area) are already here.

The deciding argument is styling: no popular React Native toast library styles
through `className`. `react-native-toast-message`, `flash-message` and
`sonner-native` all style through `StyleSheet`/props, so using the semantic
tokens (`bg-danger-surface`, `text-danger`) means supplying a custom render
component — writing the visual component anyway **and** carrying the
dependency. `burnt` would genuinely save the work by using the OS toast, but it
cannot be themed with our tokens and needs native code.

What is left for us is a single-slot state, a timer and a fade. Roughly 80
lines.

If stacked messages, swipe-to-dismiss or action buttons ("Undo") are ever
needed, a library becomes worth it — that is a rewrite of one file, not a
decision this locks.

### D3 — `Animated` from React Native core, not Reanimated

Reanimated is installed, but a 200ms fade does not need it, and using it drags
the Reanimated Jest mock into the toast's tests for no gain. Reanimated earns
its place on gesture-driven, 60fps interactions.

### D4 — The error boundary is a class, and Rule 2 gets a second exception

React error boundaries require a class component: `getDerivedStateFromError`
has no hook equivalent, in React 19 or any released version. `AGENTS.md`
Rule 2 says every component is an arrow function, so this is a genuine
exception and is documented as one — the same treatment `class ApiError`
already has.

`react-error-boundary` would keep Rule 2 intact by wrapping the class for us.
Rejected: one dependency for ~30 lines we fully understand, in a boilerplate
whose selling point is few dependencies.

### D5 — Toasts come from TanStack Query's global cache callbacks

The dying case is a query that fails with no call-site handler, so the toast
must fire from `QueryCache.onError`, not from call sites.

- **Queries** toast on error by default. Opt out per query with
  `meta: { silent: true }`.
- **Mutations** never toast by default — screens already render submit errors
  inline, and a mutation always has a call site. Opt in with
  `meta: { toastOnError: true }`.
- **`session` errors never toast**, in either case: the app is already
  navigating to sign-in, and a red message alongside that redirect reads as a
  second, unrelated failure.

### D6 — The reporter is a registration seam, not a context read

`QueryCache.onError` is configured at module scope, where React context does
not exist. Rather than build the `QueryClient` inside a component to close over
the toast, `errors/` exposes `configureErrorReporter({ showError })` and
`ErrorToastProvider` registers on mount, unregisters on unmount — the same
pattern `AuthProvider` already uses with `configureAuthorization`.

With no reporter registered, the global handler is a no-op. It must never throw
from inside an error handler.

### D7 — Retry on queries only

`retry: shouldRetry` applies to queries. Mutations keep TanStack's default of
no retry: repeating a `POST /auth/register` produces a duplicate side effect,
and no classification of the error changes that.

### D8 — Module copy is registered by the composition root

`App.tsx` calls `registerErrorCopy(AUTH_ERROR_COPY)`, one line per module.

Registering as an import-time side effect inside each module was rejected: it
depends on import order and on the file actually being imported, which fails
silently and is awkward to reset between tests. Adding a module already touches
`App.tsx` and `RootStack.tsx` anyway.

## Design

### 1. `src/errors/classify.ts`

```ts
export const ERROR_KINDS = {
  OFFLINE: 'offline',
  SERVER: 'server',
  INPUT: 'input',
  SESSION: 'session',
  UNEXPECTED: 'unexpected',
} as const;

export type ErrorKind = (typeof ERROR_KINDS)[keyof typeof ERROR_KINDS];

export const classifyError = (error: unknown): ErrorKind => { /* ... */ };
export const isRetryable = (error: unknown): boolean => { /* ... */ };
export const shouldRetry = (failureCount: number, error: unknown): boolean => { /* ... */ };
```

Five kinds, one per decision the app actually makes:

| Kind | Source | Retryable | Normally arrives from |
|---|---|---|---|
| `offline` | `NETWORK_ERROR` — never reached the API | yes | a query |
| `server` | status ≥ 500, or `INTERNAL_SERVER_ERROR` | yes | either |
| `input` | any 4xx that is not a session error | no | a mutation — a form submit |
| `session` | 401 with `INVALID_ACCESS_TOKEN` | no | either |
| `unexpected` | `UNEXPECTED_RESPONSE`, or anything that is not an `ApiError` | no | either |

**`input` is every non-session 4xx, not a list of statuses.** A wrong password
is a 401 carrying `INVALID_CREDENTIALS`, so a rule written as "400, 409, 422"
would drop it into `unexpected` and answer a wrong password with generic copy.
Order matters: test for the session case first, then treat the rest of the 4xx
range as input.

`ROUTE_NOT_FOUND` lands in `input` too. That is harmless: kind drives retry and
surface only, while the sentence the user reads is keyed by `code`, and
`ROUTE_NOT_FOUND` has its own entry in the base map.

The last column says where each kind is normally *raised*, not where it is
shown — what gets a toast is decided by D5's query/mutation rule alone. An
`input` error from a query does toast; it is just rare, because input arrives
through submits.

`isRetryable` is `offline || server`. A drifted contract does not un-drift on a
second attempt.

`shouldRetry(failureCount, error)` caps attempts with a named constant and
defers to `isRetryable`.

### 2. `src/errors/copy.ts`

Holds the base map — the codes any module can receive (`NETWORK_ERROR`,
`INTERNAL_SERVER_ERROR`, `VALIDATION_ERROR`, `UNEXPECTED_RESPONSE`,
`BAD_REQUEST`, `ROUTE_NOT_FOUND`) — plus the generic fallback.

```ts
export const registerErrorCopy = (entries: Readonly<Record<string, string>>): void => { /* ... */ };
export const copyForError = (error: unknown): string => { /* ... */ };
```

`copyForError` looks up registered module copy first, then the base map, then
falls back. The API's `message` is never rendered, exactly as today.

`resetErrorCopy()` is exported for tests, so registration does not leak between
test files.

### 3. `src/errors/index.ts`

The folder's only entry point: `classifyError`, `isRetryable`, `shouldRetry`,
`ERROR_KINDS`, `ErrorKind`, `copyForError`, `registerErrorCopy`,
`resetErrorCopy`, `configureErrorReporter`, `ErrorBoundary`,
`ErrorToastProvider`, `useErrorToast`. Modules never import a file inside the
folder.

### 4. `src/errors/ErrorBoundary.tsx`

A class component holding `{ error: Error | null }`, `getDerivedStateFromError`
to capture, and a reset handler. The fallback lives in the same file: a
full-screen message with a "Try again" button that clears the state and
remounts the subtree.

Two limits, documented in the README rather than engineered around:

- One boundary at the root means a screen crash blanks the whole app.
  Preserving navigation chrome would need a second boundary inside the
  navigator — deferred, not needed for a single-stack boilerplate.
- "Try again" only resets state and remounts. A deterministic error comes
  straight back. That is what every boundary does; pretending otherwise would
  be worse.

### 5. `src/errors/ErrorToast.tsx` and `useErrorToast.ts`

Context, provider and host in one file, following the convention this repo
adopted for `AuthContext`. The hook is separate and throws outside its
provider, like `useAuth`.

- **One slot, not a queue.** A new error replaces the current one; errors
  arriving in bursts almost always share a cause.
- `Animated` fade in and out; `useSafeAreaInsets()` for placement.
- Auto-dismiss on a timer, plus tap to dismiss.
- `accessibilityLiveRegion="polite"` on Android and
  `AccessibilityInfo.announceForAccessibility` on iOS — without these the toast
  does not exist for a screen reader.
- The provider calls `configureErrorReporter` on mount and clears it on
  unmount (D6).

### 6. `src/lib/connectivity.ts`

NetInfo wired to TanStack Query's `onlineManager`, started once from `App.tsx`.

React Native has no `navigator.onLine`, so without this TanStack Query assumes
the device is always online — confirmed against its React Native documentation,
which gives this exact wiring. `@react-native-community/netinfo` is installed
with `npx expo install` and is included in Expo Go.

With it wired, queries **pause** while offline and resume on reconnect instead
of burning retries, which leaves the `offline` kind mostly for timeouts and
transient failures with nominal connectivity.

`focusManager` + `AppState` (refetch on app resume) is the same wiring but a
different problem — stale data, not errors. Deferred.

### 7. `src/modules/auth` after the change

- `errorCopy.ts` keeps `applyServerFieldErrors` — it is the module that knows
  the fields are `email` and `password` — and exports `AUTH_ERROR_COPY` with
  its two domain codes.
- `copyForError` is deleted from the module; the screens import it from
  `@/errors`.
- The `/auth/me` boot query is **not** silenced. Today a network failure at
  boot drops the user on the sign-in screen with no explanation; with the
  global toast they are told the connection failed. This is a deliberate change
  to existing behaviour.

### 8. Wiring in `App.tsx`

```
GestureHandlerRootView
  QueryClientProvider          ← retry: shouldRetry; QueryCache.onError → reporter
    SafeAreaProvider
      ErrorBoundary            ← catches AuthProvider and the navigator alike
        ErrorToastProvider     ← registers the reporter on mount
          AuthProvider
            RootNavigator
```

`App.tsx` also calls the connectivity watcher once and registers each module's
copy map.

The boundary sits inside `SafeAreaProvider` so the fallback can use insets, and
outside `AuthProvider` so a crash in the provider is caught too.

## Testing

| File | What it proves |
|---|---|
| `classify.test.ts` | every kind from a representative `ApiError`, and a non-`ApiError` landing in `unexpected` |
| `copy.test.ts` | base lookup, module override, unknown code → fallback, registry reset between tests |
| `ErrorBoundary.test.tsx` | a throwing child renders the fallback; retry remounts |
| `ErrorToast.test.tsx` | `showError` renders the message; dismissal by timer (fake timers) and by tap |
| one integration test | a failing query reaches the toast through the registered reporter — the bootstrap seam is the piece most likely to be wrong |

React writes the captured error to `console.error`, so the boundary test must
silence it or the suite output looks like a failure.

## Documentation

- `src/errors/README.md` — new, Portuguese prose per Rule 3, listing the
  exports and carrying the two boundary limits from §4.
- `src/lib/README.md` — add `connectivity`.
- `src/modules/auth/README.md` — copy now comes from `@/errors`; the boot
  toast is described.
- `AGENTS.md` — Rule 2 gains the error-boundary class as a named exception.
- `ARCHITECTURE.md` — `src/errors/` in the §2 tree and the boundary table;
  the error flow in a short subsection; §10 loses the items now built.

## Delivery slices

1. `classify.ts` + tests.
2. `copy.ts` + registry + tests; auth's `errorCopy.ts` trimmed, screens
   repointed.
3. `ErrorBoundary.tsx` + test.
4. `ErrorToast.tsx` + `useErrorToast.ts` + tests.
5. `lib/connectivity.ts` + the `App.tsx` wiring + the integration test.
6. Documentation.

## Verification

`pnpm check` and `pnpm test:ci` after every slice.

**Not verifiable here**, and must not be claimed: this is WSL2 with no Xcode,
no Android SDK and no device. Nothing in this spec proves the toast animates
correctly, that the safe-area placement is right on a notched device, that
NetInfo reports real connectivity changes, or that a screen reader announces
the toast. Those need a dev client on real hardware:

1. Kill the API and open the app — expect the offline toast, not a silent
   sign-in screen.
2. Turn airplane mode on and off with the app open — queries should pause and
   resume without a burst of failures.
3. Throw from a screen's render deliberately — expect the fallback, not a
   crash.
4. Turn on VoiceOver/TalkBack and trigger a toast — expect it announced.

## Out of scope / explicitly deferred

Telemetry and crash reporting of any kind · a toast queue · swipe-to-dismiss ·
toasts with actions · a per-screen error boundary · i18n beyond the existing
map seam · catching unhandled promise rejections outside TanStack Query ·
`focusManager`/`AppState` refetch on resume · retrying mutations.
