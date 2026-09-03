# Error Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `src/errors/` — error classification, a shared copy registry, a render error boundary and a global error toast — plus the connectivity wiring that lets TanStack Query know the device is offline.

**Architecture:** One flat top-level folder owns the whole concern and exposes it through a single `index.ts`. It depends on `src/lib/` (for `ApiError` and `API_ERROR_CODES`) and nothing depends on it except `App.tsx` and the screens. Because TanStack Query's global cache callbacks are configured at module scope where React context does not exist, the toast provider registers itself through a module-level seam — the same pattern `AuthProvider` already uses with `configureAuthorization`.

**Tech Stack:** Expo SDK 57 · React Native 0.86 · TypeScript 6 · TanStack Query 5 · axios · `@react-native-community/netinfo` · NativeWind v4 · Jest (jest-expo) + React Native Testing Library · Biome · pnpm

**Spec:** [`docs/superpowers/specs/2026-09-02-error-layer-design.md`](../specs/2026-09-02-error-layer-design.md)

## Global Constraints

Every task's requirements implicitly include this section.

- **English only** in code — comments, JSDoc, identifiers, file names, commit messages. `README.md` prose is **Portuguese**; identifiers and folder names inside them stay English.
- **Arrow functions assigned to a `const`.** Never a `function` declaration or expression. **`ErrorBoundary` is the one exception in this plan** — React has no hook equivalent of `getDerivedStateFromError`, so it is a class, and Task 3 adds it to `AGENTS.md` Rule 2 as a named exception (`class ApiError` is the existing one).
- **No magic strings or numbers.** `UPPER_SNAKE_CASE` primitives carrying their unit (`TOAST_DURATION_MS`); closed sets as a `const` object + derived union type, never a TS `enum`. User-facing copy lives in a `COPY` object colocated with its component.
- **Route names and API paths are the exception** — those are written as literals (`AGENTS.md` Rule 4). Nothing in this plan adds either.
- **Design values come from Tailwind/NativeWind classes only** — no `StyleSheet.create`. An inline `style` object is allowed **only** where an API forces it: the toast passes an `Animated.Value` and a runtime safe-area inset, neither of which can travel through `className`. Comment it where it happens.
- **Prefer semantic colour aliases** (`bg-background`, `text-content-muted`, `bg-danger-surface`, `text-danger`) over raw scales. Note `bg-danger-500` does **not** resolve — the semantic alias shadows the scale (`src/theme/README.md`).
- **`@/` alias** points at `src/`; never write `../../`. Nothing outside a folder imports a file inside it — only what its `index.ts` exports.
- **Tests are colocated** with a `.test.ts` / `.test.tsx` suffix. The suffix is what `biome.json` matches to exempt tests from `noMagicNumbers`. `render()` and `fireEvent.*()` return Promises in the installed RNTL and **must be awaited**.
- **`noUncheckedIndexedAccess` is on** — indexing a record yields `T | undefined`.
- **Biome's `organizeImports` is an error, and orders exports too.** It sorts uppercase before lowercase and merges adjacent import groups. The snippets below are written for readability — run `pnpm lint:fix` after pasting one, before `pnpm check`.
- **Never use `AbortSignal.timeout()`.** React Native polyfills `AbortSignal` with `abort-controller@3`, which has no static `timeout()`; Node (and therefore Jest) has it, so the mistake passes every test and crashes the app.
- **Every task ends green** on `pnpm check` (typecheck + lint) and `pnpm test:ci`, and ends with a commit.

---

### Task 1: Error classification

The pure core. Everything later in the plan asks this module what kind of failure it is holding.

**Files:**
- Create: `src/errors/classify.ts`
- Test: `src/errors/classify.test.ts`

**Interfaces:**
- Consumes: `ApiError`, `API_ERROR_CODES` from `@/lib`.
- Produces: `ERROR_KINDS`, `type ErrorKind`, `classifyError(error: unknown): ErrorKind`, `isRetryable(error: unknown): boolean`, `shouldRetry(failureCount: number, error: unknown): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/errors/classify.test.ts`:

```ts
import { API_ERROR_CODES, ApiError } from '@/lib';

import { classifyError, ERROR_KINDS, isRetryable, shouldRetry } from './classify';

const apiError = (status: number, code: string) =>
  new ApiError({ status, code, message: 'not contract' });

describe('classifyError', () => {
  it('calls a request that never reached the API offline', () => {
    expect(classifyError(apiError(0, API_ERROR_CODES.NETWORK_ERROR))).toBe(ERROR_KINDS.OFFLINE);
  });

  it('calls a 500 a server error', () => {
    expect(classifyError(apiError(500, API_ERROR_CODES.INTERNAL_SERVER_ERROR))).toBe(
      ERROR_KINDS.SERVER,
    );
  });

  it('calls a rejected access token a session error', () => {
    expect(classifyError(apiError(401, API_ERROR_CODES.INVALID_ACCESS_TOKEN))).toBe(
      ERROR_KINDS.SESSION,
    );
  });

  it('calls a wrong password input, not a session error, though it is also a 401', () => {
    // The whole reason session is tested before the 4xx range: answering a
    // wrong password with generic copy would be the most common error in the
    // app getting the least useful message.
    expect(classifyError(apiError(401, API_ERROR_CODES.INVALID_CREDENTIALS))).toBe(
      ERROR_KINDS.INPUT,
    );
  });

  it('calls a validation failure input', () => {
    expect(classifyError(apiError(400, API_ERROR_CODES.VALIDATION_ERROR))).toBe(ERROR_KINDS.INPUT);
  });

  it('calls a conflict input', () => {
    expect(classifyError(apiError(409, API_ERROR_CODES.EMAIL_ALREADY_IN_USE))).toBe(
      ERROR_KINDS.INPUT,
    );
  });

  it('calls a drifted contract unexpected', () => {
    expect(classifyError(apiError(200, API_ERROR_CODES.UNEXPECTED_RESPONSE))).toBe(
      ERROR_KINDS.UNEXPECTED,
    );
  });

  it('calls anything that is not an ApiError unexpected', () => {
    expect(classifyError(new TypeError('undefined is not a function'))).toBe(
      ERROR_KINDS.UNEXPECTED,
    );
    expect(classifyError('a thrown string')).toBe(ERROR_KINDS.UNEXPECTED);
  });
});

describe('isRetryable', () => {
  it('retries what a second attempt could fix', () => {
    expect(isRetryable(apiError(0, API_ERROR_CODES.NETWORK_ERROR))).toBe(true);
    expect(isRetryable(apiError(503, API_ERROR_CODES.INTERNAL_SERVER_ERROR))).toBe(true);
  });

  it('does not retry what a second attempt cannot fix', () => {
    expect(isRetryable(apiError(401, API_ERROR_CODES.INVALID_CREDENTIALS))).toBe(false);
    expect(isRetryable(apiError(401, API_ERROR_CODES.INVALID_ACCESS_TOKEN))).toBe(false);
    expect(isRetryable(apiError(200, API_ERROR_CODES.UNEXPECTED_RESPONSE))).toBe(false);
  });
});

describe('shouldRetry', () => {
  const retryable = apiError(0, API_ERROR_CODES.NETWORK_ERROR);

  it('allows one more attempt after the first failure', () => {
    expect(shouldRetry(0, retryable)).toBe(true);
    expect(shouldRetry(1, retryable)).toBe(false);
  });

  it('never retries a terminal error, however few attempts happened', () => {
    expect(shouldRetry(0, apiError(400, API_ERROR_CODES.VALIDATION_ERROR))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec jest --ci src/errors/classify.test.ts`
Expected: FAIL — `Cannot find module './classify'`.

- [ ] **Step 3: Implement `src/errors/classify.ts`**

```ts
import { API_ERROR_CODES, ApiError } from '@/lib';

export const ERROR_KINDS = {
  /** Never reached the API: offline, DNS, timeout. */
  OFFLINE: 'offline',
  /** The API answered, and it was its own fault. */
  SERVER: 'server',
  /** The API rejected what was sent, and the user can fix it. */
  INPUT: 'input',
  /** The stored token is no longer valid. */
  SESSION: 'session',
  /** A drifted contract, or something that is not an `ApiError` at all. */
  UNEXPECTED: 'unexpected',
} as const;

export type ErrorKind = (typeof ERROR_KINDS)[keyof typeof ERROR_KINDS];

const UNAUTHORIZED_STATUS = 401;
const LOWEST_CLIENT_ERROR_STATUS = 400;
const LOWEST_SERVER_ERROR_STATUS = 500;

/** Attempts, not retries: 2 is the original call plus one more. */
const MAX_QUERY_ATTEMPTS = 2;

export const classifyError = (error: unknown): ErrorKind => {
  if (!(error instanceof ApiError)) return ERROR_KINDS.UNEXPECTED;

  if (error.code === API_ERROR_CODES.NETWORK_ERROR) return ERROR_KINDS.OFFLINE;
  if (error.code === API_ERROR_CODES.UNEXPECTED_RESPONSE) return ERROR_KINDS.UNEXPECTED;

  // Session before the 4xx range, and by code rather than by status: a wrong
  // password is a 401 too, and it is input the user can correct, not a session
  // that ended.
  if (
    error.status === UNAUTHORIZED_STATUS &&
    error.code === API_ERROR_CODES.INVALID_ACCESS_TOKEN
  ) {
    return ERROR_KINDS.SESSION;
  }

  if (error.status >= LOWEST_SERVER_ERROR_STATUS) return ERROR_KINDS.SERVER;
  if (error.status >= LOWEST_CLIENT_ERROR_STATUS) return ERROR_KINDS.INPUT;

  return ERROR_KINDS.UNEXPECTED;
};

const RETRYABLE_KINDS: readonly ErrorKind[] = [ERROR_KINDS.OFFLINE, ERROR_KINDS.SERVER];

export const isRetryable = (error: unknown): boolean =>
  RETRYABLE_KINDS.includes(classifyError(error));

/** Shaped for TanStack Query's `retry` option. Queries only — see the plan. */
export const shouldRetry = (failureCount: number, error: unknown): boolean =>
  failureCount < MAX_QUERY_ATTEMPTS && isRetryable(error);
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm exec jest --ci src/errors/classify.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Verify and commit**

```bash
pnpm lint:fix && pnpm check && pnpm test:ci
git add src/errors
git commit -m "feat: classify errors by the decision they lead to"
```

---

### Task 2: Copy registry, and auth's copy trimmed to its own codes

**Files:**
- Create: `src/errors/copy.ts`
- Test: `src/errors/copy.test.ts`
- Modify: `src/modules/auth/errorCopy.ts`
- Modify: `src/modules/auth/index.ts`
- Modify: `src/modules/auth/screens/SignInScreen.tsx`
- Modify: `src/modules/auth/screens/SignUpScreen.tsx`

**Interfaces:**
- Consumes: `ApiError`, `API_ERROR_CODES` from `@/lib`.
- Produces: `copyForError(error: unknown): string`, `registerErrorCopy(entries: Readonly<Record<string, string>>): void`, `resetErrorCopy(): void`, all from `src/errors/copy.ts`; and `AUTH_ERROR_COPY` exported from `@/modules/auth`.
- Removes: `copyForError` from `src/modules/auth/errorCopy.ts`. `applyServerFieldErrors` stays there — it is the module that knows its fields are `email` and `password`.

- [ ] **Step 1: Write the failing test**

Create `src/errors/copy.test.ts`:

```ts
import { API_ERROR_CODES, ApiError } from '@/lib';

import { copyForError, registerErrorCopy, resetErrorCopy } from './copy';

const FALLBACK = 'Something went wrong. Please try again.';

const apiError = (code: string) =>
  new ApiError({ status: 400, code, message: 'never rendered' });

beforeEach(() => {
  resetErrorCopy();
});

describe('copyForError', () => {
  it('answers from the base map for a code any module can receive', () => {
    expect(copyForError(apiError(API_ERROR_CODES.NETWORK_ERROR))).toBe(
      'Could not reach the server. Check your connection.',
    );
  });

  it('falls back for a code nobody registered', () => {
    expect(copyForError(apiError('A_CODE_SHIPPED_LATER'))).toBe(FALLBACK);
  });

  it('falls back for something that is not an ApiError', () => {
    expect(copyForError(new TypeError('boom'))).toBe(FALLBACK);
  });

  it('never renders the API message', () => {
    expect(copyForError(new ApiError({ status: 500, code: 'X', message: 'stack trace' }))).not.toBe(
      'stack trace',
    );
  });

  it('answers from a module map once it is registered', () => {
    registerErrorCopy({ INVALID_CREDENTIALS: 'Email or password is incorrect.' });

    expect(copyForError(apiError('INVALID_CREDENTIALS'))).toBe('Email or password is incorrect.');
  });

  it('lets a module override a base entry for its own domain', () => {
    registerErrorCopy({ [API_ERROR_CODES.VALIDATION_ERROR]: 'Check the highlighted fields.' });

    expect(copyForError(apiError(API_ERROR_CODES.VALIDATION_ERROR))).toBe(
      'Check the highlighted fields.',
    );
  });

  it('keeps registrations from separate modules side by side', () => {
    registerErrorCopy({ FIRST: 'from module one' });
    registerErrorCopy({ SECOND: 'from module two' });

    expect(copyForError(apiError('FIRST'))).toBe('from module one');
    expect(copyForError(apiError('SECOND'))).toBe('from module two');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec jest --ci src/errors/copy.test.ts`
Expected: FAIL — `Cannot find module './copy'`.

- [ ] **Step 3: Implement `src/errors/copy.ts`**

```ts
import { API_ERROR_CODES, ApiError } from '@/lib';

type ErrorCopyMap = Readonly<Record<string, string>>;

/**
 * The codes any module can receive, whatever it was asking for. A module's own
 * domain codes are registered by the composition root — see `registerErrorCopy`.
 */
const BASE_COPY: ErrorCopyMap = {
  [API_ERROR_CODES.NETWORK_ERROR]: 'Could not reach the server. Check your connection.',
  [API_ERROR_CODES.INTERNAL_SERVER_ERROR]: 'The server had a problem. Please try again.',
  [API_ERROR_CODES.VALIDATION_ERROR]: 'Please check the fields above.',
  [API_ERROR_CODES.UNEXPECTED_RESPONSE]: 'Something went wrong. Please try again.',
  [API_ERROR_CODES.BAD_REQUEST]: 'That request could not be processed.',
  [API_ERROR_CODES.ROUTE_NOT_FOUND]: 'That resource no longer exists.',
};

/** A code with no entry must never leave the screen silent. */
const FALLBACK_COPY = 'Something went wrong. Please try again.';

let registeredCopy: ErrorCopyMap = {};

/**
 * Called by `App.tsx`, once per module. Registering as an import-time side
 * effect inside the module instead would depend on import order and on the
 * file actually being imported — a failure that is silent and hard to test.
 */
export const registerErrorCopy = (entries: ErrorCopyMap): void => {
  registeredCopy = { ...registeredCopy, ...entries };
};

/** For tests, so a registration in one file cannot leak into another. */
export const resetErrorCopy = (): void => {
  registeredCopy = {};
};

/**
 * `code` is the API's stable contract and doubles as the i18n key. `message` is
 * for logs and never reaches the screen.
 */
export const copyForError = (error: unknown): string => {
  if (!(error instanceof ApiError)) return FALLBACK_COPY;

  return registeredCopy[error.code] ?? BASE_COPY[error.code] ?? FALLBACK_COPY;
};
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm exec jest --ci src/errors/copy.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Trim `src/modules/auth/errorCopy.ts` to the module's own codes**

Replace the whole file with:

```ts
import type { UseFormSetError } from 'react-hook-form';

import { ApiError } from '@/lib';

import type { Credentials } from './validations';

const FORM_FIELDS = {
  EMAIL: 'email',
  PASSWORD: 'password',
} as const;

type FormField = (typeof FORM_FIELDS)[keyof typeof FORM_FIELDS];

/**
 * This module's domain codes only. Everything a module can receive whatever it
 * asked for — network, 500, drifted contract — lives in `@/errors`, and
 * `App.tsx` registers this map there.
 */
export const AUTH_ERROR_COPY = {
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  EMAIL_ALREADY_IN_USE: 'This email is already registered.',
} as const;

const SERVER_FIELD_MESSAGE = 'The server rejected this value.';

const isFormField = (field: string | undefined): field is FormField =>
  field === FORM_FIELDS.EMAIL || field === FORM_FIELDS.PASSWORD;

/**
 * Puts the API's per-field `details[]` where react-hook-form already renders
 * local errors, so server validation and client validation land in the same
 * place on the screen. It stays in this module because only this module knows
 * its fields are `email` and `password`.
 */
export const applyServerFieldErrors = (
  error: unknown,
  setError: UseFormSetError<Credentials>,
): void => {
  if (!(error instanceof ApiError)) return;

  for (const detail of error.details) {
    if (isFormField(detail.field)) {
      setError(detail.field, { message: SERVER_FIELD_MESSAGE });
    }
  }
};
```

- [ ] **Step 6: Create `src/errors/index.ts`**

The screens import from `@/errors` in the next step, so the entry point has to
exist first.

```ts
export { classifyError, ERROR_KINDS, type ErrorKind, isRetryable, shouldRetry } from './classify';
export { copyForError, registerErrorCopy, resetErrorCopy } from './copy';
```

Later tasks add to this file as they add exports.

- [ ] **Step 7: Repoint the two screens**

In **both** `src/modules/auth/screens/SignInScreen.tsx` and `src/modules/auth/screens/SignUpScreen.tsx`, change the import of `copyForError` so it comes from the new home, leaving `applyServerFieldErrors` where it is:

```tsx
import { copyForError } from '@/errors';

import { applyServerFieldErrors } from '../errorCopy';
```

The bodies of both screens are unchanged — `copyForError(error)` is called exactly as before.

- [ ] **Step 8: Export the module's map**

Add to `src/modules/auth/index.ts`:

```ts
export { AUTH_ERROR_COPY } from './errorCopy';
```

- [ ] **Step 9: Verify and commit**

The two screen tests already assert on the copy strings (`'Email or password is incorrect.'`, `'Something went wrong. Please try again.'`), so they are the proof this migration preserved behaviour. They must pass **without being edited**. If they fail, the copy moved but the wiring did not.

```bash
pnpm lint:fix && pnpm check && pnpm test:ci
git add src/errors src/modules/auth
git commit -m "feat: share the error copy map across modules"
```

---

### Task 3: The render error boundary

**Files:**
- Create: `src/errors/ErrorBoundary.tsx`
- Test: `src/errors/ErrorBoundary.test.tsx`
- Modify: `src/errors/index.ts`
- Modify: `AGENTS.md` (Rule 2 gains a second named exception)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ErrorBoundary` — a component taking only `children`.

- [ ] **Step 1: Write the failing test**

Create `src/errors/ErrorBoundary.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ErrorBoundary } from './ErrorBoundary';

const HEALTHY_TEXT = 'all good';
const RETRY_LABEL = 'Try again';
const FALLBACK_TITLE = 'Something went wrong';

let shouldThrow = true;

const Bomb = () => {
  if (shouldThrow) throw new Error('render exploded');

  return <Text>{HEALTHY_TEXT}</Text>;
};

let consoleError: jest.SpyInstance;

beforeEach(() => {
  shouldThrow = true;
  // React writes every error a boundary catches to console.error. Without this
  // the suite output looks like a failure even when the test passes.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('ErrorBoundary', () => {
  it('renders its children while nothing throws', async () => {
    shouldThrow = false;

    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText(HEALTHY_TEXT)).toBeTruthy();
  });

  it('renders the fallback instead of crashing when a child throws', async () => {
    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText(FALLBACK_TITLE)).toBeTruthy();
    expect(screen.queryByText(HEALTHY_TEXT)).toBeNull();
  });

  it('remounts the subtree when the user retries', async () => {
    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    // Whatever caused the crash has to be gone before retrying, exactly as in
    // the app: the button only remounts, it cannot repair anything.
    shouldThrow = false;
    await fireEvent.press(screen.getByText(RETRY_LABEL));

    expect(await screen.findByText(HEALTHY_TEXT)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec jest --ci src/errors/ErrorBoundary.test.tsx`
Expected: FAIL — `Cannot find module './ErrorBoundary'`.

- [ ] **Step 3: Implement `src/errors/ErrorBoundary.tsx`**

```tsx
import { Component, type PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';

const COPY = {
  title: 'Something went wrong',
  description: 'The app hit an unexpected problem and could not continue.',
  retryLabel: 'Try again',
} as const;

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * The one class component in this codebase, and a deliberate exception to rule
 * 2 of `AGENTS.md`: `getDerivedStateFromError` has no hook equivalent in any
 * released version of React, so a boundary cannot be an arrow function.
 *
 * Two limits are accepted rather than engineered around, and both are in
 * `README.md`: one boundary at the root means a screen crash blanks the whole
 * app, and "try again" only remounts the subtree — a deterministic error comes
 * straight back.
 */
export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  private readonly reset = (): void => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="mb-2 text-2xl font-semibold text-content">{COPY.title}</Text>
        <Text className="mb-6 text-center text-base text-content-muted">{COPY.description}</Text>
        <Pressable
          accessibilityRole="button"
          className="rounded-lg bg-primary px-4 py-3 active:bg-primary-pressed"
          onPress={this.reset}
        >
          <Text className="text-base font-semibold text-content-inverse">{COPY.retryLabel}</Text>
        </Pressable>
      </View>
    );
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm exec jest --ci src/errors/ErrorBoundary.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Export it**

Add to `src/errors/index.ts`:

```ts
export { ErrorBoundary } from './ErrorBoundary';
```

- [ ] **Step 6: Record the exception in `AGENTS.md`**

In Rule 2, after the paragraph explaining that Biome enforces arrow components, add:

```md
Two exceptions, both because `instanceof` or React itself requires a class:
`ApiError` in `src/lib/api.ts`, and `ErrorBoundary` in `src/errors/`, whose
`getDerivedStateFromError` has no hook equivalent in any released React.
```

- [ ] **Step 7: Verify and commit**

```bash
pnpm lint:fix && pnpm check && pnpm test:ci
git add src/errors AGENTS.md
git commit -m "feat: stop a render error from taking down the app"
```

---

### Task 4: The error toast and its reporter seam

**Files:**
- Create: `src/errors/reporter.ts`
- Create: `src/errors/ErrorToast.tsx`
- Test: `src/errors/ErrorToast.test.tsx`
- Create: `src/errors/useErrorToast.ts`
- Modify: `src/errors/index.ts`

**Interfaces:**
- Consumes: `classifyError`, `ERROR_KINDS` from `./classify`; `copyForError` from `./copy`.
- Produces: `configureErrorReporter(reporter: ErrorReporter | null): void` and `reportError(error: unknown): void` from `./reporter`, where `type ErrorReporter = (error: unknown) => void`; `ErrorToastProvider` — a component taking only `children`; `useErrorToast(): { showError: (error: unknown) => void }`.

**Note on the spec:** §D6 writes the seam as `configureErrorReporter({ showError })`. With a single callback the wrapper object buys nothing, so this takes the function directly. `configureAuthorization` takes an object because it carries two callbacks.

- [ ] **Step 1: Write `src/errors/reporter.ts`**

No test of its own — Task 5's integration test is what proves it, and a test of a two-line setter would only restate the setter.

```ts
export type ErrorReporter = (error: unknown) => void;

let reporter: ErrorReporter | null = null;

/**
 * The seam between TanStack Query's global cache callbacks — configured at
 * module scope, where React context does not exist — and the toast, which is a
 * React provider. `ErrorToastProvider` registers on mount and clears on
 * unmount, the same shape `AuthProvider` uses with `configureAuthorization`.
 */
export const configureErrorReporter = (next: ErrorReporter | null): void => {
  reporter = next;
};

/** A no-op with nothing registered: this runs inside an error handler already. */
export const reportError = (error: unknown): void => {
  reporter?.(error);
};
```

- [ ] **Step 2: Write the failing toast test**

Create `src/errors/ErrorToast.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { type Metrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { API_ERROR_CODES, ApiError } from '@/lib';

import { registerErrorCopy, resetErrorCopy } from './copy';
import { ErrorToastProvider } from './ErrorToast';
import { reportError } from './reporter';
import { useErrorToast } from './useErrorToast';

const OFFLINE_COPY = 'Could not reach the server. Check your connection.';
const TRIGGER_LABEL = 'trigger';

const offlineError = new ApiError({
  status: 0,
  code: API_ERROR_CODES.NETWORK_ERROR,
  message: 'never rendered',
});

const sessionError = new ApiError({
  status: 401,
  code: API_ERROR_CODES.INVALID_ACCESS_TOKEN,
  message: 'never rendered',
});

const Trigger = ({ error }: { error: unknown }) => {
  const { showError } = useErrorToast();

  return (
    <Pressable onPress={() => showError(error)}>
      <Text>{TRIGGER_LABEL}</Text>
    </Pressable>
  );
};

/**
 * `useSafeAreaInsets()` throws with no provider above it, so every render of
 * the toast needs one. `initialMetrics` skips the native measurement, which
 * never resolves under Jest.
 */
const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const withProviders = (error: unknown) => (
  <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
    <ErrorToastProvider>
      <Trigger error={error} />
    </ErrorToastProvider>
  </SafeAreaProvider>
);

const renderWithProvider = async (error: unknown) => render(withProviders(error));

beforeEach(() => {
  resetErrorCopy();
  jest.useRealTimers();
});

describe('ErrorToastProvider', () => {
  it('shows nothing until an error arrives', async () => {
    await renderWithProvider(offlineError);

    expect(screen.queryByText(OFFLINE_COPY)).toBeNull();
  });

  it('renders the copy chosen for the error, never the API message', async () => {
    await renderWithProvider(offlineError);
    await fireEvent.press(screen.getByText(TRIGGER_LABEL));

    expect(await screen.findByText(OFFLINE_COPY)).toBeTruthy();
    expect(screen.queryByText('never rendered')).toBeNull();
  });

  it('stays silent for a session error, which is already sending the user to sign-in', async () => {
    await renderWithProvider(sessionError);
    await fireEvent.press(screen.getByText(TRIGGER_LABEL));

    expect(screen.queryByText(OFFLINE_COPY)).toBeNull();
  });

  it('replaces the current message rather than queueing', async () => {
    registerErrorCopy({ SECOND_CODE: 'the second problem' });

    const { rerender } = await renderWithProvider(offlineError);
    await fireEvent.press(screen.getByText(TRIGGER_LABEL));
    expect(await screen.findByText(OFFLINE_COPY)).toBeTruthy();

    await rerender(
      withProviders(new ApiError({ status: 400, code: 'SECOND_CODE', message: 'x' })),
    );
    await fireEvent.press(screen.getByText(TRIGGER_LABEL));

    expect(await screen.findByText('the second problem')).toBeTruthy();
    expect(screen.queryByText(OFFLINE_COPY)).toBeNull();
  });

  it('dismisses when the toast is tapped', async () => {
    await renderWithProvider(offlineError);
    await fireEvent.press(screen.getByText(TRIGGER_LABEL));
    await screen.findByText(OFFLINE_COPY);

    await fireEvent.press(screen.getByText(OFFLINE_COPY));

    expect(screen.queryByText(OFFLINE_COPY)).toBeNull();
  });

  it('registers itself as the reporter while mounted', async () => {
    await renderWithProvider(offlineError);

    reportError(offlineError);

    expect(await screen.findByText(OFFLINE_COPY)).toBeTruthy();
  });

  it('unregisters on unmount, so a late error cannot reach a dead provider', async () => {
    const { unmount } = await renderWithProvider(offlineError);

    await unmount();

    expect(() => reportError(offlineError)).not.toThrow();
  });
});
```

`useErrorToast` throwing outside its provider is left to the type system and
the throw statement itself, the same way `useAuth` is — asserting on a render
that throws is brittle in the installed RNTL and would test the harness more
than the hook.

- [ ] **Step 3: Run it and confirm it fails**

Run: `pnpm exec jest --ci src/errors/ErrorToast.test.tsx`
Expected: FAIL — `Cannot find module './ErrorToast'`.

- [ ] **Step 4: Implement `src/errors/ErrorToast.tsx`**

```tsx
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { classifyError, ERROR_KINDS } from './classify';
import { copyForError } from './copy';
import { configureErrorReporter } from './reporter';

const TOAST_DURATION_MS = 4000;
const FADE_DURATION_MS = 200;
const TOAST_TOP_OFFSET = 8;
const HIDDEN_OPACITY = 0;
const VISIBLE_OPACITY = 1;

const IOS_PLATFORM = 'ios';

export interface ErrorToastValue {
  showError: (error: unknown) => void;
}

/**
 * Lives with its provider rather than in a file of its own: only `useErrorToast`
 * reads it, and the provider is the only thing that can fill it.
 */
export const ErrorToastContext = createContext<ErrorToastValue | null>(null);

export const ErrorToastProvider = ({ children }: PropsWithChildren) => {
  const [message, setMessage] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(HIDDEN_OPACITY)).current;
  const dismissTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimeout = useCallback(() => {
    if (dismissTimeout.current !== null) clearTimeout(dismissTimeout.current);
    dismissTimeout.current = null;
  }, []);

  const hide = useCallback(() => {
    clearDismissTimeout();
    Animated.timing(opacity, {
      toValue: HIDDEN_OPACITY,
      duration: FADE_DURATION_MS,
      useNativeDriver: true,
    }).start(() => setMessage(null));
  }, [clearDismissTimeout, opacity]);

  const showError = useCallback(
    (error: unknown) => {
      // A session error is already sending the user to sign-in; a red message
      // beside that redirect reads as a second, unrelated failure.
      if (classifyError(error) === ERROR_KINDS.SESSION) return;

      const copy = copyForError(error);

      setMessage(copy);
      // Android gets it from accessibilityLiveRegion below; iOS has no
      // equivalent and would announce nothing at all without this.
      if (Platform.OS === IOS_PLATFORM) AccessibilityInfo.announceForAccessibility(copy);

      clearDismissTimeout();
      dismissTimeout.current = setTimeout(hide, TOAST_DURATION_MS);

      opacity.setValue(HIDDEN_OPACITY);
      Animated.timing(opacity, {
        toValue: VISIBLE_OPACITY,
        duration: FADE_DURATION_MS,
        useNativeDriver: true,
      }).start();
    },
    [clearDismissTimeout, hide, opacity],
  );

  useEffect(() => {
    configureErrorReporter(showError);

    return () => configureErrorReporter(null);
  }, [showError]);

  useEffect(() => clearDismissTimeout, [clearDismissTimeout]);

  const value = useMemo<ErrorToastValue>(() => ({ showError }), [showError]);

  return (
    <ErrorToastContext.Provider value={value}>
      <View className="flex-1">
        {children}
        {message === null ? null : (
          <Animated.View
            accessibilityLiveRegion="polite"
            className="absolute inset-x-4 rounded-lg bg-danger-surface p-4"
            // Forced inline: an Animated.Value and a runtime safe-area inset
            // cannot travel through className.
            style={{ opacity, top: insets.top + TOAST_TOP_OFFSET }}
          >
            <Pressable accessibilityRole="button" onPress={hide}>
              <Text className="text-sm text-danger">{message}</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </ErrorToastContext.Provider>
  );
};
```

- [ ] **Step 5: Implement `src/errors/useErrorToast.ts`**

```ts
import { useContext } from 'react';

import { ErrorToastContext, type ErrorToastValue } from './ErrorToast';

const MISSING_PROVIDER_MESSAGE = 'useErrorToast was called outside of <ErrorToastProvider>.';

/**
 * Throws rather than returning a no-op: a missing provider would mean errors
 * disappearing silently, which is the exact failure this layer exists to end.
 */
export const useErrorToast = (): ErrorToastValue => {
  const value = useContext(ErrorToastContext);

  if (value === null) throw new Error(MISSING_PROVIDER_MESSAGE);

  return value;
};
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `pnpm exec jest --ci src/errors/ErrorToast.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 7: Export the new surface**

Add to `src/errors/index.ts`:

```ts
export { ErrorToastProvider, type ErrorToastValue } from './ErrorToast';
export { configureErrorReporter, type ErrorReporter, reportError } from './reporter';
export { useErrorToast } from './useErrorToast';
```

- [ ] **Step 8: Verify and commit**

```bash
pnpm lint:fix && pnpm check && pnpm test:ci
git add src/errors
git commit -m "feat: surface ownerless errors in a toast"
```

---

### Task 5: Connectivity and the composition root

The task that makes the previous four do anything. It is also the one whose seam is most likely to be wrong, so it carries the integration test.

**Files:**
- Modify: `package.json` (one dependency)
- Create: `src/lib/connectivity.ts`
- Modify: `src/lib/index.ts`
- Modify: `App.tsx`
- Test: `src/errors/reporting.test.tsx`

**Interfaces:**
- Consumes: `shouldRetry`, `reportError`, `registerErrorCopy`, `ErrorBoundary`, `ErrorToastProvider` from `@/errors`; `AUTH_ERROR_COPY` from `@/modules/auth`.
- Produces: `startConnectivityWatch(): void` from `@/lib`.

- [ ] **Step 1: Install NetInfo**

```bash
npx expo install @react-native-community/netinfo
```

`npx expo install`, not `pnpm add`: it resolves the version matching SDK 57 rather than the newest published one. The package is included in Expo Go, so this does not force a dev client rebuild.

- [ ] **Step 2: Implement `src/lib/connectivity.ts`**

```ts
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

/**
 * React Native has no `navigator.onLine`, so without this TanStack Query
 * assumes the device is permanently online: it never pauses a query and it
 * burns retries against a radio that is off. Wiring it makes queries pause
 * while offline and resume on reconnect.
 *
 * Called once, from `App.tsx`. The app never unsubscribes — the listener lives
 * exactly as long as the process.
 */
export const startConnectivityWatch = (): void => {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected));
    }),
  );
};
```

- [ ] **Step 3: Export it**

Add to `src/lib/index.ts`:

```ts
export { startConnectivityWatch } from './connectivity';
```

- [ ] **Step 4: Write the failing integration test**

Create `src/errors/reporting.test.tsx`:

```tsx
import { QueryCache, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { type Metrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { API_ERROR_CODES, ApiError } from '@/lib';

import { resetErrorCopy } from './copy';
import { ErrorToastProvider } from './ErrorToast';
import { reportError } from './reporter';

const OFFLINE_COPY = 'Could not reach the server. Check your connection.';
const LOADING_TEXT = 'loading';

const offlineError = new ApiError({
  status: 0,
  code: API_ERROR_CODES.NETWORK_ERROR,
  message: 'never rendered',
});

/** The toast reads safe-area insets, which throw with no provider above them. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const FailingQuery = () => {
  useQuery({ queryKey: ['probe'], queryFn: async () => Promise.reject(offlineError), retry: false });

  return <Text>{LOADING_TEXT}</Text>;
};

const SilentQuery = () => {
  useQuery({
    queryKey: ['silent-probe'],
    queryFn: async () => Promise.reject(offlineError),
    retry: false,
    meta: { silent: true },
  });

  return <Text>{LOADING_TEXT}</Text>;
};

const renderApp = async (silent: boolean) => {
  // Its own client, not App.tsx's: this proves the seam, not the composition
  // root, and a shared client would carry cache between the two cases.
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.silent !== true) reportError(error);
      },
    }),
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <QueryClientProvider client={queryClient}>
        <ErrorToastProvider>{silent ? <SilentQuery /> : <FailingQuery />}</ErrorToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
};

beforeEach(() => {
  resetErrorCopy();
});

describe('a failing query', () => {
  it('reaches the toast through the registered reporter', async () => {
    await renderApp(false);

    expect(await screen.findByText(OFFLINE_COPY)).toBeTruthy();
  });

  it('stays silent when the query opted out with meta.silent', async () => {
    await renderApp(true);
    await screen.findByText(LOADING_TEXT);

    expect(screen.queryByText(OFFLINE_COPY)).toBeNull();
  });
});
```

- [ ] **Step 5: Run it and confirm it fails**

Run: `pnpm exec jest --ci src/errors/reporting.test.tsx`
Expected: FAIL — the toast copy is not found, because nothing has wired `QueryCache.onError` to `reportError` yet in this test's own client. (This test builds its own client on purpose: it proves the seam, not `App.tsx`.)

If it *passes* at this point, something else is registering a reporter — stop and find out what.

- [ ] **Step 6: Rewrite `App.tsx`**

```tsx
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';

import { ErrorBoundary, ErrorToastProvider, registerErrorCopy, reportError, shouldRetry } from '@/errors';
import { startConnectivityWatch } from '@/lib';
import { AUTH_ERROR_COPY, AuthProvider } from '@/modules/auth';
import { RootNavigator } from '@/navigation';

/** `GestureHandlerRootView` needs a real style object — NativeWind cannot reach it. */
const ROOT_STYLE = { flex: 1 } as const;

const STATUS_BAR_STYLE = 'auto';

const QUERY_STALE_TIME_MS = 30000;

startConnectivityWatch();
registerErrorCopy(AUTH_ERROR_COPY);

/**
 * Module scope on purpose: a client built inside the component would be thrown
 * away and rebuilt on every render, taking the cache with it.
 *
 * Queries report by default — a background query has no call site to show its
 * failure. Mutations do not: a form already renders its submit error inline,
 * and toasting it too would say the same thing twice.
 */
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silent !== true) reportError(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.toastOnError === true) reportError(error);
    },
  }),
  defaultOptions: {
    queries: { retry: shouldRetry, staleTime: QUERY_STALE_TIME_MS },
  },
});

const App = () => (
  <GestureHandlerRootView style={ROOT_STYLE}>
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <ErrorToastProvider>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </ErrorToastProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </QueryClientProvider>
  </GestureHandlerRootView>
);

export default App;
```

`ErrorBoundary` sits inside `SafeAreaProvider` so its fallback can use insets, and outside `AuthProvider` so a crash in the provider is caught too. `StatusBar` moves inside the boundary's subtree along with everything else.

- [ ] **Step 7: Run the integration test and confirm it passes**

Run: `pnpm exec jest --ci src/errors/reporting.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 8: Confirm the auth boot behaviour changed as intended**

`AuthProvider`'s `/auth/me` query is deliberately **not** silenced, so a network failure at boot now shows the offline toast instead of dropping the user on the sign-in screen with no explanation (spec §7). Its own `retry: ME_RETRY_COUNT` (0) still wins over the new global `shouldRetry`, so boot is not slowed down.

Run the auth suite and confirm it is untouched by all of this:

Run: `pnpm exec jest --ci src/modules/auth`
Expected: PASS, unchanged.

- [ ] **Step 9: Verify and commit**

```bash
pnpm lint:fix && pnpm check && pnpm test:ci
git add package.json pnpm-lock.yaml src/lib src/errors App.tsx
git commit -m "feat: report query failures and pause queries offline"
```

---

### Task 6: Documentation

The code is done; this task makes the repository describe it honestly. Nothing here changes behaviour, so there is no test cycle — the gate is that every claim matches the code.

**Files:**
- Create: `src/errors/README.md`
- Modify: `src/lib/README.md`
- Modify: `src/modules/auth/README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `README.md`

- [ ] **Step 1: Write `src/errors/README.md`**

```md
# Errors

Uma resposta só para "o que acontece quando algo falha": classificação do erro,
a copy que o usuário lê, o error boundary de render e o toast global.

## Components

| Name | Description |
| ---- | ------------- |
| `ErrorBoundary` | Contém uma exceção de render e mostra uma tela de fallback com "tentar de novo". |
| `ErrorToastProvider` | Segura o toast e se registra como reporter global enquanto está montado. |

## Hooks

| Name | Description |
| ---- | ------------- |
| `useErrorToast()` | `{ showError }`. Lança se usado fora do `ErrorToastProvider`. |

## Functions

| Name | Description |
| ---- | ------------- |
| `classifyError(error)` | Devolve o `ErrorKind` do erro. |
| `isRetryable(error)` | `true` só para `offline` e `server`. |
| `shouldRetry(failureCount, error)` | No formato que a opção `retry` do TanStack Query espera. |
| `copyForError(error)` | A frase que o usuário lê, escolhida pelo `code`. |
| `registerErrorCopy(entries)` | Registra a copy de domínio de um módulo. Chamado pelo `App.tsx`. |
| `resetErrorCopy()` | Só para testes, para um registro não vazar de um arquivo para outro. |
| `configureErrorReporter(fn)` | Registra quem exibe o erro. `null` desregistra. |
| `reportError(error)` | Entrega o erro a quem estiver registrado. No-op se não houver ninguém. |

## Constants

| Name | Description |
| ---- | ------------- |
| `ERROR_KINDS` | `offline` \| `server` \| `input` \| `session` \| `unexpected`. |

## Conventions

- **`input` é qualquer 4xx que não seja erro de sessão**, e a ordem do teste
  importa: senha errada também é 401, e classificá-la como sessão responderia o
  erro mais comum do app com a copy mais genérica.
- **Query mostra toast, mutation não.** Uma query de fundo não tem call site
  para exibir a falha; um formulário já mostra o erro de submit inline, e
  repetir em toast diria a mesma coisa duas vezes. Uma query sai da regra com
  `meta: { silent: true }`; uma mutation entra com `meta: { toastOnError: true }`.
- **Erro de sessão nunca vira toast**, por nenhum caminho: o app já está levando
  o usuário para o login, e uma mensagem vermelha junto lê como uma segunda
  falha sem relação.
- **O reporter é um ponto de registro, não leitura de context.** O
  `QueryCache.onError` é configurado em escopo de módulo, onde context React não
  existe — mesma costura que o `AuthProvider` usa com `configureAuthorization`.
- **A copy de domínio é do módulo; o `App.tsx` registra.** Registrar como efeito
  colateral de import dependeria da ordem dos imports e de o arquivo ser mesmo
  importado — falha silenciosa e chata de testar.
- **O `ErrorBoundary` é classe**, e é exceção nomeada à regra 2 do `AGENTS.md`:
  `getDerivedStateFromError` não tem equivalente com hooks em nenhuma versão
  lançada do React.

## Limites aceitos

- **Um boundary só, na raiz.** Um crash de tela apaga o app inteiro, não só a
  tela. Preservar a navegação exigiria um segundo boundary dentro do navigator —
  fica para quando houver mais de um stack para preservar.
- **"Tentar de novo" só remonta.** Se o erro for determinístico, ele volta. É o
  que todo boundary faz; fingir o contrário seria pior.
- **Um slot, não fila.** Erro novo substitui o anterior. Erros em rajada quase
  sempre têm a mesma causa.

## Não existe ainda

Telemetria de qualquer tipo, swipe para dispensar, toast com ação, boundary por
tela, e captura de rejeição de promise fora do TanStack Query. O desenho está em
`docs/superpowers/specs/2026-09-02-error-layer-design.md`.
```

- [ ] **Step 2: Update `src/lib/README.md`**

Add to the `## Functions` table:

```md
| `startConnectivityWatch()`     | Liga o NetInfo ao `onlineManager` do TanStack Query. Chamado uma vez pelo `App.tsx`. |
```

And add to `## Conventions`:

```md
- **O React Native não tem `navigator.onLine`.** Sem `startConnectivityWatch()`,
  o TanStack Query assume que o aparelho está sempre online: nunca pausa uma
  query e gasta tentativas contra um rádio desligado.
```

- [ ] **Step 3: Update `src/modules/auth/README.md`**

Replace the bullet that says the API `message` never reaches the screen with:

```md
- **A `message` da API nunca vai para a tela.** A copy sai de `@/errors`,
  escolhida pelo `code`; este módulo registra só os seus dois códigos de domínio
  em `AUTH_ERROR_COPY`, e o `App.tsx` os registra na camada de erros.
- **O `/auth/me` do boot não é silencioso.** Se ele falhar por rede, o usuário
  vê um toast de "sem conexão" em vez de cair no login sem explicação.
```

- [ ] **Step 4: Update `ARCHITECTURE.md`**

1. **Stack hoje** — append ` · @react-native-community/netinfo` to the list.

2. **§2, a árvore** — insert this block immediately before the `lib/` entry, and add `connectivity.ts` inside `lib/`:

```text
├── errors/                   uma resposta só para "o que acontece quando algo falha"
│   ├── classify.ts          ERROR_KINDS + classifyError/isRetryable/shouldRetry
│   ├── copy.ts              mapa base + registro por módulo → a frase que o usuário lê
│   ├── reporter.ts          o seam entre o QueryCache.onError e o provider do toast
│   ├── ErrorBoundary.tsx    a ÚNICA classe do código (React exige) + a tela de fallback
│   ├── ErrorToast.tsx       context + provider + host, um slot só
│   ├── useErrorToast.ts     { showError }
│   ├── reporting.test.tsx   integração: query que falha chega ao toast
│   ├── index.ts
│   └── README.md
```

3. **§2, tabela de fronteira** — add this row after the `src/lib/**` row:

```md
| `src/errors/**` | pode importar de `src/lib/`; nunca o contrário, e nunca um módulo |
```

4. **§4, Legal / não legal** — add this row:

```md
| `class ErrorBoundary extends Component` | Um boundary "funcional" — `getDerivedStateFromError` não existe como hook |
```

5. **§9** — add after the axios decision:

```md
**O toast é componente nosso, não uma lib.** Nenhuma lib popular de toast do
React Native estiliza por `className` — todas usam `StyleSheet`/props — então
usar os tokens semânticos exigiria passar um componente de render customizado,
ou seja, escrever o visual do mesmo jeito **e** carregar a dependência. Sobra
para nós um slot, um timer e um fade.

**`Animated` do core, não Reanimated,** para esse fade de 200ms. O Reanimated
está instalado (o NativeWind v4 exige), mas usá-lo aqui traria o mock dele para
os testes do toast sem nada em troca: ele ganha o lugar em interação por gesto
a 60fps, não numa transição de opacidade.
```

6. **§10** — remove `estados de erro e loading` from the list, and make the telemetry absence explicit by adding `telemetria e crash reporting (nenhum sink; a camada de erros não reporta para lugar nenhum)`.

- [ ] **Step 5: Update `README.md`**

In **Roadmap**, the `Polimento` item keeps only the adoption guide; error and loading states are done. Add a line to **Status** saying the app has a global error layer with boundary, toast and offline-aware queries.

- [ ] **Step 6: Verify and commit**

```bash
pnpm check && pnpm test:ci
git add README.md ARCHITECTURE.md src
git commit -m "docs: describe the error layer"
```

---

## Verification

Runnable in this environment, after every task:

```bash
pnpm check      # tsc --noEmit && biome check
pnpm test:ci    # jest --ci
```

**Not runnable here, and must not be claimed:** this is WSL2 with no Xcode, no
Android SDK and no device. Nothing in this plan proves the toast animates, that
its safe-area placement is right on a notched device, that NetInfo reports real
connectivity changes, or that a screen reader announces it. That verification is
a separate manual pass on a machine with a dev client:

1. Kill the API and open the app — expect the offline toast, not a silent
   sign-in screen.
2. Toggle airplane mode with the app open — queries should pause and resume,
   not burst-fail.
3. Throw from a screen's render deliberately — expect the fallback.
4. Turn on VoiceOver/TalkBack and trigger a toast — expect it announced.

## Out of scope

Telemetry and crash reporting · a toast queue · swipe-to-dismiss · toasts with
actions · a per-screen error boundary · i18n beyond the existing map seam ·
unhandled promise rejections outside TanStack Query · `focusManager`/`AppState`
refetch on resume · retrying mutations.
