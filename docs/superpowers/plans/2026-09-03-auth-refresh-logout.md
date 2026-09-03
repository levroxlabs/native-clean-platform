# Auth refresh and server-side logout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app hold a session past the access token's one-hour life, and end it on the server when the user signs out — from this device or from all of them.

**Architecture:** Secure storage stops holding the access token and holds the rotating refresh token instead. A single-flight queue in `src/modules/auth/` owns refreshing; `src/lib/api.ts` only knows to call it on a `401 INVALID_ACCESS_TOKEN` and repeat the request once. Boot restores a session by spending the stored refresh token rather than by trusting a stored access token.

**Tech Stack:** TypeScript, React Native 0.86 / Expo 57, axios, TanStack Query 5, zod 4, `expo-secure-store`, NativeWind 4, jest-expo + React Native Testing Library, Biome.

**Spec:** [`docs/superpowers/specs/2026-09-03-auth-refresh-logout-design.md`](../specs/2026-09-03-auth-refresh-logout-design.md) — read it before Task 1; every decision reference below (D1–D9) points into it.

## Global Constraints

- **English only** in code, comments, identifiers, file names and commit messages. `README.md` prose is the one exception: it is written in Portuguese, with English identifiers and folder names.
- **Arrow functions assigned to a `const`.** No `function` declarations or expressions, components included.
- **No magic strings or numbers.** Named constants in `UPPER_SNAKE_CASE` carrying their unit; closed sets are a `const` object with `as const` plus a derived union type, never a TS `enum`. Route names and API paths stay inline — they are each declared exactly once.
- **User-facing copy lives in a `COPY` object** colocated with its screen or component.
- **Styling is NativeWind classes only**, preferring semantic aliases (`bg-background`, `text-content`, `text-danger`) over raw scales. No `StyleSheet.create`, no inline style objects.
- **Imports use the `@/` alias**, never `../../`. Nothing outside a module imports a file inside it — only what `src/modules/<m>/index.ts` exports. `src/lib/**` may import no module and no React; `src/errors/**` may import `src/lib/` but never a module. A module importing `@/errors` is allowed and is used by this plan.
- **Tests are colocated** next to the file they test, with the `.test.ts`/`.test.tsx` suffix — that exact suffix is what Biome's `noMagicNumbers` override matches, so any other name silently fails `pnpm lint`. Never `__tests__/`, never snapshots.
- **`render()` and `fireEvent.*()` are awaited.** In the installed version they return Promises, and omitting `await` fails confusingly later in the test rather than at the call site.
- **`pnpm check` (typecheck + lint) and `pnpm test:ci` are green before every commit.**
- **A module's `README.md` is updated in the same change** that adds, removes or renames one of its exports.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: The single-flight queue

The API states the requirement in its own OpenAPI description: clients MUST serialise their refresh calls — one in flight at a time, with later callers awaiting the same result. Two concurrent refreshes of the same token return two different tokens and only the last one issued stays valid.

**Files:**
- Create: `src/modules/auth/utils/singleFlight.ts`
- Test: `src/modules/auth/utils/singleFlight.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `createSingleFlight<TResult>(run: () => Promise<TResult>): () => Promise<TResult>` — Task 4 wraps the refresh runner in it.

- [ ] **Step 1: Write the failing test**

Create `src/modules/auth/utils/singleFlight.test.ts`:

```ts
import { createSingleFlight } from './singleFlight';

const FIRST_RESULT = 'token-1';
const SECOND_RESULT = 'token-2';
const FAILURE_MESSAGE = 'the refresh failed';

/** A promise the test settles by hand, so two callers can overlap on purpose. */
const deferred = <TResult>() => {
  let resolve!: (value: TResult) => void;
  let reject!: (reason: unknown) => void;

  const promise = new Promise<TResult>((resolveIt, rejectIt) => {
    resolve = resolveIt;
    reject = rejectIt;
  });

  return { promise, resolve, reject };
};

describe('createSingleFlight', () => {
  it('runs the work once while a call is in flight, and answers both callers', async () => {
    const pending = deferred<string>();
    const run = jest.fn(() => pending.promise);
    const call = createSingleFlight(run);

    const first = call();
    const second = call();
    pending.resolve(FIRST_RESULT);

    await expect(first).resolves.toBe(FIRST_RESULT);
    await expect(second).resolves.toBe(FIRST_RESULT);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh run once the previous one has settled', async () => {
    // It shares a run in progress; it does not cache a result. A refresh token
    // is spent by the call that uses it, so a cached answer would be poison.
    const run = jest
      .fn<Promise<string>, []>()
      .mockResolvedValueOnce(FIRST_RESULT)
      .mockResolvedValueOnce(SECOND_RESULT);
    const call = createSingleFlight(run);

    await expect(call()).resolves.toBe(FIRST_RESULT);
    await expect(call()).resolves.toBe(SECOND_RESULT);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('delivers the same rejection to every caller waiting on the run', async () => {
    const pending = deferred<string>();
    const call = createSingleFlight(() => pending.promise);

    // Both handlers are attached BEFORE the rejection, so neither call is
    // briefly unhandled — which Node reports as a warning and Jest can fail on.
    const settled = Promise.all([
      call().catch((error: unknown) => error),
      call().catch((error: unknown) => error),
    ]);

    pending.reject(new Error(FAILURE_MESSAGE));

    const [firstError, secondError] = await settled;

    expect(firstError).toBeInstanceOf(Error);
    expect(firstError).toBe(secondError);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test:ci src/modules/auth/utils/singleFlight.test.ts`
Expected: FAIL — `Cannot find module './singleFlight'`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/auth/utils/singleFlight.ts`:

```ts
/**
 * Wraps an async operation so concurrent callers share one run instead of
 * starting several.
 *
 * The API requires exactly this of `/auth/refresh`: the presented token is
 * spent by the call that uses it, so two concurrent refreshes return two
 * different tokens and only the last one issued stays valid — the client that
 * kept the other is signed out on its next refresh.
 */
export const createSingleFlight = <TResult>(
  run: () => Promise<TResult>,
): (() => Promise<TResult>) => {
  // In the factory's closure, not in the returned function: every call has to
  // see the same slot.
  let inFlight: Promise<TResult> | null = null;

  return (): Promise<TResult> => {
    // Assigned before returning, so a second caller in the same tick finds it.
    // Cleared when the run settles: this shares a run in progress, it does not
    // cache a result — and a refresh token is spent by the call that uses it.
    inFlight ??= run().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
};
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm test:ci src/modules/auth/utils/singleFlight.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify the whole tree is still green**

Run: `pnpm check && pnpm test:ci`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/auth/utils/singleFlight.ts src/modules/auth/utils/singleFlight.test.ts
git commit -m "$(cat <<'EOF'
feat: share one run between concurrent callers

The API requires refresh calls to be serialised: the presented token is spent
by the call that uses it, so two concurrent refreshes return two tokens and
only the last one issued survives.

It shares a run in progress rather than caching a result — a cached refresh
answer would hand out a token that was already spent.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: What the three new error codes mean

The API grew `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_REUSED` (both 401) and `TRANSACTION_CONFLICT` (503, with `Retry-After`). This task teaches the client to classify and phrase them, and gives the auth module one predicate for "the session is over".

It also fixes a latent defect: today a 401 carrying any code other than `INVALID_ACCESS_TOKEN` falls through to the `>= 400` catch-all and is classified `INPUT`, which would render "Please check the fields above." for a session that just ended.

**Files:**
- Modify: `src/lib/api.ts` (the `API_ERROR_CODES` object)
- Modify: `src/errors/classify.ts`
- Modify: `src/errors/copy.ts` (the `BASE_COPY` map)
- Modify: `src/modules/auth/errorCopy.ts`
- Modify: `src/modules/auth/utils/session.ts` (`isRejectedToken` → `isEndedSession`)
- Modify: `src/modules/auth/context/AuthContext.tsx:104` (the one call site)
- Test: `src/errors/classify.test.ts`, `src/errors/copy.test.ts`, `src/modules/auth/utils/session.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `API_ERROR_CODES.INVALID_REFRESH_TOKEN`, `API_ERROR_CODES.REFRESH_TOKEN_REUSED`, `API_ERROR_CODES.TRANSACTION_CONFLICT`; `isEndedSession(error: unknown): boolean` exported from `src/modules/auth/utils/session.ts`. Tasks 4, 5 and 6 use all four.

- [ ] **Step 1: Write the failing tests**

Append to `src/errors/classify.test.ts`, inside the existing `describe('classifyError', ...)`:

```ts
  it('calls a rejected refresh token a session error', () => {
    expect(classifyError(apiError(401, API_ERROR_CODES.INVALID_REFRESH_TOKEN))).toBe(
      ERROR_KINDS.SESSION,
    );
  });

  it('calls a reused refresh token a session error', () => {
    // The API has already revoked the whole family by the time this arrives:
    // there is nothing to correct and nothing to retry.
    expect(classifyError(apiError(401, API_ERROR_CODES.REFRESH_TOKEN_REUSED))).toBe(
      ERROR_KINDS.SESSION,
    );
  });

  it('calls a transaction conflict a server error, since it arrives as a 503', () => {
    expect(classifyError(apiError(503, API_ERROR_CODES.TRANSACTION_CONFLICT))).toBe(
      ERROR_KINDS.SERVER,
    );
  });
```

And, inside the existing `describe('isRetryable', ...)` (or as its own `it` at the end of the file if that describe is named differently):

```ts
  it('retries a transaction conflict, which is transient by construction', () => {
    expect(isRetryable(apiError(503, API_ERROR_CODES.TRANSACTION_CONFLICT))).toBe(true);
  });
```

Append to `src/errors/copy.test.ts`, inside `describe('copyForError', ...)`:

```ts
  it('phrases a transaction conflict as something to try again', () => {
    expect(copyForError(apiError(API_ERROR_CODES.TRANSACTION_CONFLICT))).toBe(
      'The server is busy. Please try again.',
    );
  });
```

Replace the whole `describe('isRejectedToken', ...)` block in `src/modules/auth/utils/session.test.ts` with:

```ts
describe('isEndedSession', () => {
  it.each([
    API_ERROR_CODES.INVALID_ACCESS_TOKEN,
    API_ERROR_CODES.INVALID_REFRESH_TOKEN,
    API_ERROR_CODES.REFRESH_TOKEN_REUSED,
  ])('is true for %s, which all mean the session is over', (code) => {
    expect(isEndedSession(new ApiError({ status: 401, code, message: 'not contract' }))).toBe(true);
  });

  it('is false for a wrong password, which is a 401 the user can correct', () => {
    expect(
      isEndedSession(
        new ApiError({
          status: 401,
          code: API_ERROR_CODES.INVALID_CREDENTIALS,
          message: 'Invalid credentials',
        }),
      ),
    ).toBe(false);
  });

  it('is false when the request never reached the API', () => {
    // Being offline is not a reason to make the user type their password again.
    expect(
      isEndedSession(
        new ApiError({
          status: 0,
          code: API_ERROR_CODES.NETWORK_ERROR,
          message: 'The request did not reach the API.',
        }),
      ),
    ).toBe(false);
  });

  it('is false for anything that is not an ApiError', () => {
    expect(isEndedSession(new TypeError('boom'))).toBe(false);
    expect(isEndedSession(null)).toBe(false);
  });
});
```

Update that file's import line from `isRejectedToken` to `isEndedSession`.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test:ci src/errors/classify.test.ts src/errors/copy.test.ts src/modules/auth/utils/session.test.ts`
Expected: FAIL — `isEndedSession` is not exported, and the new codes are `undefined` on `API_ERROR_CODES`.

- [ ] **Step 3: Add the codes**

In `src/lib/api.ts`, inside `API_ERROR_CODES`, after `INVALID_PASSWORD` and before the two client-side codes:

```ts
  /** The refresh token is unknown, expired, or was not presented at all. */
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  /**
   * A spent refresh token came back outside the API's 30-second grace window.
   * The whole session family is already revoked by the time this arrives.
   */
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  /** A database conflict that survived the API's own retries. Arrives as a 503. */
  TRANSACTION_CONFLICT: 'TRANSACTION_CONFLICT',
```

- [ ] **Step 4: Widen the session branch in `classify.ts`**

Add above `classifyError`:

```ts
/**
 * The 401s that mean the session is over. A wrong password is a 401 too, and it
 * is input the user can correct — which is why this is a code set and not a
 * status check.
 */
const SESSION_ERROR_CODES: readonly string[] = [
  API_ERROR_CODES.INVALID_ACCESS_TOKEN,
  API_ERROR_CODES.INVALID_REFRESH_TOKEN,
  API_ERROR_CODES.REFRESH_TOKEN_REUSED,
];
```

and replace the session branch inside `classifyError` with:

```ts
  if (error.status === UNAUTHORIZED_STATUS && SESSION_ERROR_CODES.includes(error.code)) {
    return ERROR_KINDS.SESSION;
  }
```

- [ ] **Step 5: Add the copy**

In `src/errors/copy.ts`, add to `BASE_COPY`:

```ts
  [API_ERROR_CODES.TRANSACTION_CONFLICT]: 'The server is busy. Please try again.',
```

In `src/modules/auth/errorCopy.ts`, add to `AUTH_ERROR_COPY`:

```ts
  INVALID_REFRESH_TOKEN: 'Your session has expired. Please sign in again.',
  REFRESH_TOKEN_REUSED: 'Your session was ended for security. Please sign in again.',
```

- [ ] **Step 6: Replace `isRejectedToken` with `isEndedSession`**

In `src/modules/auth/utils/session.ts`, replace the `isRejectedToken` export (and adjust the imports — `ApiError` and `API_ERROR_CODES` are no longer needed there):

```ts
import { classifyError, ERROR_KINDS } from '@/errors';

/**
 * The session is over, as opposed to the request being wrong or the device
 * being offline. Delegated to `classifyError` rather than listing the codes
 * again: the error layer already owns "what kind of failure is this", and two
 * lists of the same three codes would drift the day a fourth one lands.
 */
export const isEndedSession = (error: unknown): boolean =>
  classifyError(error) === ERROR_KINDS.SESSION;
```

In `src/modules/auth/context/AuthContext.tsx`, change the import on line 17 and the call on line 104 from `isRejectedToken` to `isEndedSession`. Nothing else in that file changes yet.

- [ ] **Step 7: Run the tests and verify they pass**

Run: `pnpm test:ci src/errors src/modules/auth`
Expected: PASS.

- [ ] **Step 8: Verify the whole tree is still green**

Run: `pnpm check && pnpm test:ci`
Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/api.ts src/errors src/modules/auth/errorCopy.ts src/modules/auth/utils/session.ts src/modules/auth/utils/session.test.ts src/modules/auth/context/AuthContext.tsx
git commit -m "$(cat <<'EOF'
feat: give the refresh failures a kind and a sentence

A 401 carrying any code but INVALID_ACCESS_TOKEN fell through to the 4xx
catch-all and was classified as input, so a session that had just ended would
have rendered "Please check the fields above."

isEndedSession delegates to classifyError instead of repeating the code set:
two lists of the same three codes drift the day a fourth one lands.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The three new API calls

**Files:**
- Modify: `src/modules/auth/api/schemas.ts`
- Modify: `src/modules/auth/api/authApi.ts`
- Test: `src/modules/auth/api/schemas.test.ts`, `src/modules/auth/api/authApi.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces:
  - `sessionTokensSchema` and `type SessionTokens = { accessToken: string; refreshToken: string }`
  - `refreshSession(refreshToken: string): Promise<SessionTokens>`
  - `logout(refreshToken: string): Promise<void>`
  - `logoutEverywhere(): Promise<void>`

  Tasks 4 and 6 call all of these.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/auth/api/schemas.test.ts`:

```ts
describe('sessionTokensSchema', () => {
  it('parses the pair the API returns in body transport', () => {
    expect(
      sessionTokensSchema.safeParse({ accessToken: 'an-access', refreshToken: 'a-refresh' })
        .success,
    ).toBe(true);
  });

  it('rejects a response with no refresh token', () => {
    // The API declares it optional because one schema serves both transports.
    // This client always asks for body transport, so an answer without it is
    // drift, and it should be loud rather than silently signing the user out an
    // hour later.
    expect(sessionTokensSchema.safeParse({ accessToken: 'an-access' }).success).toBe(false);
  });

  it('rejects an empty token on either half', () => {
    expect(
      sessionTokensSchema.safeParse({ accessToken: '', refreshToken: 'a-refresh' }).success,
    ).toBe(false);
    expect(
      sessionTokensSchema.safeParse({ accessToken: 'an-access', refreshToken: '' }).success,
    ).toBe(false);
  });
});
```

Add `sessionTokensSchema` to that file's import from `./schemas`.

In `src/modules/auth/api/authApi.test.ts`, add these three constants beside the existing `CREDENTIALS` and `USER_ID` at the top of the file — Task 4 reuses them:

```ts
const ACCESS_TOKEN = 'an-access-token';
const REFRESH_TOKEN = 'a-refresh-token';
const ROTATED_REFRESH_TOKEN = 'the-next-refresh-token';
```

Then append the three describe blocks:

```ts
describe('refreshSession', () => {
  it('posts the stored token and returns the rotated pair', async () => {
    mockApi.post.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: ROTATED_REFRESH_TOKEN,
    });

    await expect(refreshSession(REFRESH_TOKEN)).resolves.toEqual({
      accessToken: ACCESS_TOKEN,
      refreshToken: ROTATED_REFRESH_TOKEN,
    });
    expect(mockApi.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: REFRESH_TOKEN });
  });

  it('rejects an answer with no refresh token as a contract drift', async () => {
    mockApi.post.mockResolvedValue({ accessToken: ACCESS_TOKEN });

    await expect(refreshSession(REFRESH_TOKEN)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});

describe('logout', () => {
  it('posts the refresh token and parses nothing, since the API answers 204', async () => {
    mockApi.post.mockResolvedValue(null);

    await expect(logout(REFRESH_TOKEN)).resolves.toBeUndefined();
    expect(mockApi.post).toHaveBeenCalledWith('/auth/logout', { refreshToken: REFRESH_TOKEN });
  });
});

describe('logoutEverywhere', () => {
  it('posts with no body, since the API takes the user from the bearer token', async () => {
    // Deliberate: sending a userId here would let any authenticated caller sign
    // anyone out, so the API reads it from the verified token subject only.
    mockApi.post.mockResolvedValue(null);

    await expect(logoutEverywhere()).resolves.toBeUndefined();
    expect(mockApi.post).toHaveBeenCalledWith('/auth/logout-all');
  });
});
```

Add `logout`, `logoutEverywhere` and `refreshSession` to that file's import from `./authApi`.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test:ci src/modules/auth/api`
Expected: FAIL — `refreshSession`, `logout`, `logoutEverywhere` and `sessionTokensSchema` are not exported.

- [ ] **Step 3: Add the schema**

In `src/modules/auth/api/schemas.ts`, rename the existing `MIN_ACCESS_TOKEN_LENGTH` constant to `MIN_TOKEN_LENGTH` (it now guards both halves), keep `loginResponseSchema` as it is for now, and add:

```ts
/**
 * What `login` and `refresh` both answer.
 *
 * `refreshToken` is required here and optional in the API's own schema: the API
 * publishes one shape for both transports, and this client always asks for body
 * transport (see `authApi.ts`). An answer without it is drift.
 */
export const sessionTokensSchema = z.object({
  accessToken: z.string().min(MIN_TOKEN_LENGTH),
  refreshToken: z.string().min(MIN_TOKEN_LENGTH),
});

export type SessionTokens = z.infer<typeof sessionTokensSchema>;
```

- [ ] **Step 4: Add the three calls**

In `src/modules/auth/api/authApi.ts`, add `sessionTokensSchema` and `type SessionTokens` to the import from `./schemas`, then append:

```ts
/**
 * Spends the stored refresh token for a new pair. The presented token is dead
 * once this resolves, so the caller must persist the returned one before doing
 * anything else with it.
 */
export const refreshSession = async (refreshToken: string): Promise<SessionTokens> => {
  const payload = await api.post('/auth/refresh', { refreshToken });

  return parseOrThrow(sessionTokensSchema, payload);
};

/**
 * Ends this device's session, leaving other devices signed in. Answers 204, so
 * there is nothing to parse. Idempotent for any token presented — known or not.
 */
export const logout = async (refreshToken: string): Promise<void> => {
  await api.post('/auth/logout', { refreshToken });
};

/**
 * Ends every session of the account. No body: the API takes the user from the
 * verified bearer token, never from client input.
 */
export const logoutEverywhere = async (): Promise<void> => {
  await api.post('/auth/logout-all');
};
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm test:ci src/modules/auth/api`
Expected: PASS.

- [ ] **Step 6: Verify the whole tree is still green**

Run: `pnpm check && pnpm test:ci`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/modules/auth/api
git commit -m "$(cat <<'EOF'
feat: call refresh, logout and logout-all

sessionTokensSchema requires the refresh token that the API declares optional:
the API publishes one shape for both transports, and this client always asks
for body transport — so an answer without it is drift, and it should fail here
rather than an hour later.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The refresh token carries the session

The switch: secure storage stops holding the access token, `login` returns the pair, and boot restores a session by spending the stored refresh token. `src/lib/api.ts` is untouched here — a mid-session 401 still just ends the session, as it does today. Task 5 changes that.

These files change together because they cannot compile apart: removing the access-token storage functions breaks `AuthProvider` in the same edit.

**Files:**
- Modify: `src/modules/auth/constants.ts`
- Modify: `src/modules/auth/storage.ts`, `src/modules/auth/storage.web.ts`
- Modify: `src/modules/auth/api/schemas.ts` (remove `loginResponseSchema`)
- Modify: `src/modules/auth/api/authApi.ts` (`login`)
- Modify: `src/modules/auth/context/AuthContext.tsx`
- Test: `src/modules/auth/storage.test.ts`, `src/modules/auth/api/authApi.test.ts`, `src/modules/auth/context/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `createSingleFlight` (Task 1), `isEndedSession` (Task 2), `refreshSession` and `SessionTokens` (Task 3).
- Produces: `readRefreshToken(): Promise<string | null>`, `writeRefreshToken(token: string): Promise<void>`, `clearRefreshToken(): Promise<void>`, `REFRESH_TOKEN_STORAGE_KEY`; `login(credentials: Credentials): Promise<SessionTokens>`. Task 5 registers the provider's `refreshAccessToken`; Task 6 calls `readRefreshToken`.

- [ ] **Step 1: Write the failing storage test**

Replace the whole of `src/modules/auth/storage.test.ts`:

```ts
import { clearRefreshToken, readRefreshToken, writeRefreshToken } from './storage';

const TOKEN = 'stored-refresh-token';

beforeEach(async () => {
  await clearRefreshToken();
});

describe('refresh token storage', () => {
  it('reads null when nothing was stored', async () => {
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  it('reads back what it wrote', async () => {
    await writeRefreshToken(TOKEN);

    await expect(readRefreshToken()).resolves.toBe(TOKEN);
  });

  it('reads null after clearing', async () => {
    await writeRefreshToken(TOKEN);
    await clearRefreshToken();

    await expect(readRefreshToken()).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm test:ci src/modules/auth/storage.test.ts`
Expected: FAIL — the storage module exports no `readRefreshToken`.

- [ ] **Step 3: Swap what storage holds**

`src/modules/auth/constants.ts` — replace `ACCESS_TOKEN_STORAGE_KEY`:

```ts
/**
 * Namespaced so a second module storing a token cannot collide with this one.
 *
 * Only the refresh token is persisted: the access token lives in memory for the
 * life of the process, so a credential valid for a full hour never reaches disk.
 */
export const REFRESH_TOKEN_STORAGE_KEY = 'auth.refreshToken';
```

`src/modules/auth/storage.ts`:

```ts
import * as SecureStore from 'expo-secure-store';

import { REFRESH_TOKEN_STORAGE_KEY } from './constants';

/**
 * The native implementation: the iOS keychain and the Android keystore. The web
 * build resolves `storage.web.ts` instead — Metro picks the platform suffix.
 */
export const readRefreshToken = async (): Promise<string | null> =>
  SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY);

export const writeRefreshToken = async (token: string): Promise<void> =>
  SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, token);

export const clearRefreshToken = async (): Promise<void> =>
  SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY);
```

`src/modules/auth/storage.web.ts` — same three names, keeping the existing warning comment verbatim:

```ts
import { REFRESH_TOKEN_STORAGE_KEY } from './constants';

/**
 * `expo-secure-store` has no web implementation, and this repo supports
 * `pnpm web`. `localStorage` is NOT equivalent: it is readable by any script on
 * the origin. The web target here is a development convenience, not a supported
 * production surface — see this module's README.
 */
export const readRefreshToken = async (): Promise<string | null> =>
  globalThis.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);

export const writeRefreshToken = async (token: string): Promise<void> => {
  globalThis.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
};

export const clearRefreshToken = async (): Promise<void> => {
  globalThis.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
};
```

Note (D9): the old `auth.accessToken` entry is left orphaned in the keychain of any device that ran a previous build. This is a boilerplate with no installed base; migration code for zero users is worse than an orphaned key.

- [ ] **Step 4: Update the login test**

In `src/modules/auth/api/authApi.test.ts`, replace the whole `describe('login', ...)` block:

```ts
describe('login', () => {
  it('asks for body transport and returns both tokens', async () => {
    mockApi.post.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
    });

    await expect(login(CREDENTIALS)).resolves.toEqual({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
    });
    // Stated rather than inherited from the server default: this client depends
    // on the refresh token being in the body, so it says so.
    expect(mockApi.post).toHaveBeenCalledWith('/auth/login', {
      ...CREDENTIALS,
      refreshTransport: 'body',
    });
  });

  it('rejects an answer with no refresh token as a contract drift', async () => {
    mockApi.post.mockResolvedValue({ accessToken: ACCESS_TOKEN });

    await expect(login(CREDENTIALS)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});
```

- [ ] **Step 5: Change `login`**

In `src/modules/auth/api/authApi.ts`, add above `register`:

```ts
/** Body transport, stated rather than inherited from the server default — D6. */
const REFRESH_TRANSPORT_BODY = 'body';
```

and replace `login`:

```ts
export const login = async (credentials: Credentials): Promise<SessionTokens> => {
  const payload = await api.post('/auth/login', {
    ...credentials,
    refreshTransport: REFRESH_TRANSPORT_BODY,
  });

  return parseOrThrow(sessionTokensSchema, payload);
};
```

Remove `loginResponseSchema` from `src/modules/auth/api/schemas.ts` and from the import in `authApi.ts` — `sessionTokensSchema` replaces it.

- [ ] **Step 6: Write the failing provider tests**

In `src/modules/auth/context/AuthContext.test.tsx`:

- change the import from `../storage` to `{ clearRefreshToken, readRefreshToken, writeRefreshToken }`
- add `refreshSession` to the import from `../api/authApi`, plus `const mockRefreshSession = refreshSession as jest.MockedFunction<typeof refreshSession>;`
- add the token constants and update `beforeEach` to `await clearRefreshToken();`

```ts
const ACCESS_TOKEN = 'a-signed-token';
const REFRESH_TOKEN = 'a-refresh-token';
const ROTATED_REFRESH_TOKEN = 'the-next-refresh-token';
```

Replace the four boot tests and the sign-in/sign-up/sign-out tests' token expectations with:

```ts
  it('boots signed out when secure storage is empty', async () => {
    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    expect(mockRefreshSession).not.toHaveBeenCalled();
    expect(mockFetchMe).not.toHaveBeenCalled();
  });

  it('restores the session by spending the stored refresh token', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: ROTATED_REFRESH_TOKEN,
    });
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();

    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    expect(mockRefreshSession).toHaveBeenCalledWith(REFRESH_TOKEN);
    // The rotation is persisted: the token that was spent must not survive a
    // relaunch, or the next boot trips the API's reuse detection.
    await expect(readRefreshToken()).resolves.toBe(ROTATED_REFRESH_TOKEN);
  });

  it('clears storage when the API rejects the stored refresh token', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockRejectedValue(
      new ApiError({
        status: 401,
        code: API_ERROR_CODES.INVALID_REFRESH_TOKEN,
        message: 'Invalid or expired refresh token',
      }),
    );

    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    await expect(readRefreshToken()).resolves.toBeNull();
    expect(mockFetchMe).not.toHaveBeenCalled();
  });

  it('clears storage when a spent refresh token is reused', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockRejectedValue(
      new ApiError({
        status: 401,
        code: API_ERROR_CODES.REFRESH_TOKEN_REUSED,
        message: 'Refresh token was already used',
      }),
    );

    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  it('keeps the stored refresh token when the refresh fails for a network reason', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockRejectedValue(
      new ApiError({
        status: 0,
        code: API_ERROR_CODES.NETWORK_ERROR,
        message: 'The request did not reach the API.',
      }),
    );

    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    // Being offline is not a reason to make the user type their password again
    // on the next launch.
    await expect(readRefreshToken()).resolves.toBe(REFRESH_TOKEN);
  });

  it('signs in, storing the refresh token and exposing the user', async () => {
    mockLogin.mockResolvedValue({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN });
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();
    await screen.findByText('status:signedOut');
    await fireEvent.press(screen.getByText(SIGN_IN_LABEL));

    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    await expect(readRefreshToken()).resolves.toBe(REFRESH_TOKEN);
  });
```

In the sign-up test and both offline tests, replace `mockLogin.mockResolvedValue(TOKEN)` with `mockLogin.mockResolvedValue({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN })`. In the two offline tests, replace `await writeAccessToken(TOKEN)` with `await writeRefreshToken(REFRESH_TOKEN)` and give `mockRefreshSession` a resolved pair plus `mockFetchMe` its rejection, so the offline failure still happens at `/auth/me` where those tests aim it. Delete the old `TOKEN` constant and the existing sign-out test — Task 6 rewrites sign-out entirely; for now assert only that pressing it reaches `status:signedOut`:

```ts
  it('signs out, clearing both storage and the user', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: ROTATED_REFRESH_TOKEN,
    });
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();
    await screen.findByText('status:signedIn');
    await fireEvent.press(screen.getByText(SIGN_OUT_LABEL));

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    expect(await screen.findByText('user:none')).toBeTruthy();
    await expect(readRefreshToken()).resolves.toBeNull();
  });
```

- [ ] **Step 7: Run the tests and verify they fail**

Run: `pnpm test:ci src/modules/auth`
Expected: FAIL — `AuthContext.tsx` still imports the access-token storage functions.

- [ ] **Step 8: Rewrite the provider's session handling**

In `src/modules/auth/context/AuthContext.tsx`:

Imports — add `reportError` from `@/errors`, `refreshSession` to the `../api/authApi` import, swap the storage import, add the single-flight helper:

```ts
import { reportError } from '@/errors';
import { configureAuthorization } from '@/lib';
import { fetchMe, login, refreshSession, register } from '../api/authApi';
import { AUTH_QUERY_KEYS } from '../constants';
import { clearRefreshToken, readRefreshToken, writeRefreshToken } from '../storage';
import type { AuthContextValue } from '../types';
import { isEndedSession, resolveStatus } from '../utils/session';
import { createSingleFlight } from '../utils/singleFlight';
import type { Credentials } from '../validations';
```

`endSession` clears the refresh token:

```ts
  const endSession = useCallback(async () => {
    applyToken(null);
    await clearRefreshToken();
    queryClient.removeQueries({ queryKey: AUTH_QUERY_KEYS.ME });
  }, [applyToken, queryClient]);
```

Add the runner below `endSession`:

```ts
  /**
   * The only place a refresh happens, and it happens once at a time — the API
   * requires it: two concurrent refreshes of the same token return two tokens
   * and only the last one issued stays valid.
   *
   * Its three answers are the contract `src/lib/api.ts` reads: a token means
   * retry, `null` means the session is over AND has already been cleared here,
   * and a rejection means the refresh itself failed with the session intact.
   */
  const refreshAccessToken = useMemo(
    () =>
      createSingleFlight(async (): Promise<string | null> => {
        const stored = await readRefreshToken();

        if (stored === null) {
          await endSession();

          return null;
        }

        try {
          const { accessToken, refreshToken } = await refreshSession(stored);

          // Written BEFORE this resolves: the token just spent must not survive
          // a relaunch. If the process dies in this gap the disk holds a spent
          // token, which the API's 30-second grace window exists to forgive.
          await writeRefreshToken(refreshToken);
          applyToken(accessToken);

          return accessToken;
        } catch (error) {
          // Offline, or a 503 the API could not retry away: the caller owns it,
          // and the session stays exactly as it was.
          if (!isEndedSession(error)) throw error;

          await endSession();

          return null;
        }
      }),
    [applyToken, endSession],
  );
```

Replace the boot effect:

```ts
  // Boot: spend whatever refresh token storage holds, exactly once.
  useEffect(() => {
    let isMounted = true;

    const restore = async () => {
      const stored = await readRefreshToken();

      if (!isMounted) return;

      if (stored === null) {
        setHasCompletedBoot(true);

        return;
      }

      try {
        const accessToken = await refreshAccessToken();

        if (!isMounted) return;

        // A token hands boot over to `meQuery`; null means the runner already
        // cleared the session, so there is nothing left to wait for.
        if (accessToken === null) setHasCompletedBoot(true);
      } catch (error) {
        if (!isMounted) return;

        // Not a TanStack Query call, so the global QueryCache callback that
        // toasts a failed boot cannot see this one. Without this the user would
        // land on the sign-in screen with no explanation.
        reportError(error);
        setHasCompletedBoot(true);
      }
    };

    void restore();

    return () => {
      isMounted = false;
    };
  }, [refreshAccessToken]);
```

`establishSession` stores the refresh token:

```ts
  const establishSession = useCallback(
    async (credentials: Credentials) => {
      const { accessToken, refreshToken } = await login(credentials);

      await writeRefreshToken(refreshToken);
      applyToken(accessToken);
      // `fetchQuery`, not an invalidation: the user has to be in the cache
      // before this resolves, so the gate swaps in the same tick the screen
      // stops submitting. `networkMode: 'always'` for the same reason as
      // `meQuery` above — this imperative call has its own default and does
      // not inherit the hook's option.
      await queryClient.fetchQuery({
        queryKey: AUTH_QUERY_KEYS.ME,
        queryFn: fetchMe,
        networkMode: 'always',
      });
    },
    [applyToken, queryClient],
  );
```

Leave `configureAuthorization` registering `{ getAccessToken, onUnauthorized }` exactly as it is — Task 5 changes it.

- [ ] **Step 9: Run the tests and verify they pass**

Run: `pnpm test:ci src/modules/auth`
Expected: PASS.

- [ ] **Step 10: Verify the whole tree is still green**

Run: `pnpm check && pnpm test:ci`
Expected: both pass.

- [ ] **Step 11: Commit**

```bash
git add src/modules/auth
git commit -m "$(cat <<'EOF'
feat: carry the session on the refresh token

Secure storage holds the rotating refresh token and nothing else; the access
token lives in memory for the life of the process, so a credential valid for a
full hour no longer reaches disk. Boot restores a session by spending the
stored token instead of trusting a stored access token.

The rotated token is written BEFORE the refresh resolves. If the process dies
in that gap the disk holds a spent token, which is exactly what the API's
30-second grace window forgives.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Refresh and repeat, instead of ending the session

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/modules/auth/context/AuthContext.tsx` (the `configureAuthorization` effect)
- Test: `src/lib/api.test.ts`

**Interfaces:**
- Consumes: the provider's `refreshAccessToken` (Task 4).
- Produces: `AuthorizationHandlers = { getAccessToken: () => string | null; refreshAccessToken: () => Promise<string | null> }`. Nothing later depends on it.

- [ ] **Step 1: Write the failing tests**

In `src/lib/api.test.ts`, add a sequencing adapter beside the existing `respondWith`:

```ts
/**
 * Answers a different response per call, so a test can watch the retry: the
 * first call fails, the second succeeds. The last entry repeats for any call
 * beyond the list.
 */
const respondInOrder = (responses: readonly { status: number; data: unknown }[]) => {
  let callCount = 0;

  axiosInstance.defaults.adapter = async (config) => {
    lastConfig = config;
    const { status, data } = responses[Math.min(callCount, responses.length - 1)];
    callCount += 1;

    const response = { data, status, statusText: '', headers: {}, config } as AxiosResponse;

    if (status >= OK_STATUS && status < LOWEST_ERROR_STATUS) return response;

    throw new AxiosError('Request failed', String(status), config, null, response);
  };

  return { getCallCount: () => callCount };
};
```

Replace the two existing tests that pass `onUnauthorized` (`'ends the session on a 401 caused by the access token'` and `'does NOT end the session on the 401 a wrong password produces'`) with this describe block, and update the remaining three `configureAuthorization({ ... })` calls in the file to pass `refreshAccessToken: jest.fn()` in place of `onUnauthorized: jest.fn()`:

```ts
describe('the refresh retry', () => {
  it('refreshes and repeats the request once, with the new token', async () => {
    const adapter = respondInOrder([
      { status: 401, data: envelope(API_ERROR_CODES.INVALID_ACCESS_TOKEN) },
      { status: OK_STATUS, data: { id: 'user-1' } },
    ]);
    let currentToken = TOKEN;
    const refreshAccessToken = jest.fn(async () => {
      currentToken = FRESH_TOKEN;

      return currentToken;
    });
    configureAuthorization({ getAccessToken: () => currentToken, refreshAccessToken });

    await expect(api.get(PATH)).resolves.toEqual({ id: 'user-1' });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(adapter.getCallCount()).toBe(2);
    // The repeat goes back through the request interceptor, so it carries the
    // token the refresh just produced — not the dead one it started with.
    expect(lastConfig.headers.get('Authorization')).toBe(`Bearer ${FRESH_TOKEN}`);
  });

  it('repeats at most once, instead of looping on a token the API keeps rejecting', async () => {
    const adapter = respondInOrder([
      { status: 401, data: envelope(API_ERROR_CODES.INVALID_ACCESS_TOKEN) },
    ]);
    const refreshAccessToken = jest.fn(async () => FRESH_TOKEN);
    configureAuthorization({ getAccessToken: () => TOKEN, refreshAccessToken });

    await expect(api.get(PATH)).rejects.toMatchObject({
      status: 401,
      code: API_ERROR_CODES.INVALID_ACCESS_TOKEN,
    });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(adapter.getCallCount()).toBe(2);
  });

  it('propagates the original error when the handler says the session is over', async () => {
    const adapter = respondInOrder([
      { status: 401, data: envelope(API_ERROR_CODES.INVALID_ACCESS_TOKEN) },
    ]);
    // null means the handler has already ended the session locally: there is
    // nothing for this layer to do but report why the request failed.
    const refreshAccessToken = jest.fn(async () => null);
    configureAuthorization({ getAccessToken: () => TOKEN, refreshAccessToken });

    await expect(api.get(PATH)).rejects.toMatchObject({
      status: 401,
      code: API_ERROR_CODES.INVALID_ACCESS_TOKEN,
    });
    expect(adapter.getCallCount()).toBe(1);
  });

  it('propagates the refresh failure, so being offline is not read as a dead session', async () => {
    respondInOrder([{ status: 401, data: envelope(API_ERROR_CODES.INVALID_ACCESS_TOKEN) }]);
    const refreshAccessToken = jest.fn(async () => {
      throw new ApiError({
        status: 0,
        code: API_ERROR_CODES.NETWORK_ERROR,
        message: 'The request did not reach the API.',
      });
    });
    configureAuthorization({ getAccessToken: () => TOKEN, refreshAccessToken });

    await expect(api.get(PATH)).rejects.toMatchObject({
      status: 0,
      code: API_ERROR_CODES.NETWORK_ERROR,
    });
  });

  it('does not refresh the 401 a wrong password produces', async () => {
    respondWith(401, envelope(API_ERROR_CODES.INVALID_CREDENTIALS));
    const refreshAccessToken = jest.fn(async () => FRESH_TOKEN);
    configureAuthorization({ getAccessToken: () => null, refreshAccessToken });

    await expect(api.get(PATH)).rejects.toBeInstanceOf(ApiError);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('does not refresh a 401 from the refresh endpoint itself', async () => {
    // No opt-out flag is needed anywhere: the API gives every failure its own
    // code, and only INVALID_ACCESS_TOKEN starts a refresh.
    respondWith(401, envelope(API_ERROR_CODES.INVALID_REFRESH_TOKEN));
    const refreshAccessToken = jest.fn(async () => FRESH_TOKEN);
    configureAuthorization({ getAccessToken: () => TOKEN, refreshAccessToken });

    await expect(api.post('/auth/refresh', { refreshToken: 'spent' })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('still rejects cleanly when no handlers are registered', async () => {
    respondWith(401, envelope(API_ERROR_CODES.INVALID_ACCESS_TOKEN));
    configureAuthorization(null);

    await expect(api.get(PATH)).rejects.toBeInstanceOf(ApiError);
  });
});
```

Add `const FRESH_TOKEN = 'a-fresh-token';` beside the existing `TOKEN` constant.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test:ci src/lib/api.test.ts`
Expected: FAIL — `refreshAccessToken` is not a property of `AuthorizationHandlers`, and the request is never repeated.

- [ ] **Step 3: Change the contract**

In `src/lib/api.ts`, replace `AuthorizationHandlers` and the comment above `configureAuthorization`:

```ts
/** The pair of callbacks that ties this client to the session. */
export interface AuthorizationHandlers {
  getAccessToken: () => string | null;
  /**
   * Resolves with a fresh access token, or `null` when the session is over — in
   * which case the handler has ALREADY ended it locally. Rejects only when the
   * refresh itself failed for a reason that is not the session (offline, 503),
   * and that rejection is what the caller sees instead of the original 401.
   *
   * The handler serialises its own calls; this client may call it from several
   * failed requests at once.
   */
  refreshAccessToken: () => Promise<string | null>;
}
```

```ts
/**
 * The only tie between this module and the session. `AuthProvider` registers
 * itself on mount and clears the registration on unmount.
 *
 * This module knows only that a 401 with one particular code is worth one
 * retry. Which failures end a session, where the refresh token lives, and what
 * a reused token means all stay in `src/modules/auth/` — see spec D1.
 */
export const configureAuthorization = (next: AuthorizationHandlers | null): void => {
  handlers = next;
};
```

- [ ] **Step 4: Make `toApiError` pure again and add the retry**

Delete the session branch inside `toApiError` (the `if (response.status === UNAUTHORIZED_STATUS && ...) handlers?.onUnauthorized();` block) — it becomes a pure translation with no side effect. Then replace the response interceptor with:

```ts
interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  /** Set on the repeat, so a second 401 cannot start another refresh. */
  hasRetriedAfterRefresh?: boolean;
}

/**
 * Only a dead access token is worth refreshing. A wrong password is a 401 too,
 * and `/auth/refresh` and `/auth/logout` answer `INVALID_REFRESH_TOKEN` — so
 * the API's distinct codes are what keep this from needing a per-request
 * opt-out flag.
 */
const shouldAttemptRefresh = (error: ApiError, config: RetriableRequestConfig): boolean =>
  error.status === UNAUTHORIZED_STATUS &&
  error.code === API_ERROR_CODES.INVALID_ACCESS_TOKEN &&
  config.hasRetriedAfterRefresh !== true;

axiosInstance.interceptors.response.use(undefined, async (error: AxiosError) => {
  const apiError = toApiError(error);
  const config = error.config as RetriableRequestConfig | undefined;

  if (handlers === null || config === undefined || !shouldAttemptRefresh(apiError, config)) {
    throw apiError;
  }

  // A rejection here is NOT a dead session — it is the refresh's own failure,
  // and it propagates in place of the 401 so the caller sees why it really
  // failed. `null` is the dead session, and the handler has already cleaned up.
  const accessToken = await handlers.refreshAccessToken();

  if (accessToken === null) throw apiError;

  return axiosInstance.request({ ...config, hasRetriedAfterRefresh: true });
});
```

- [ ] **Step 5: Register the runner instead of `onUnauthorized`**

In `src/modules/auth/context/AuthContext.tsx`, replace the registration effect:

```ts
  useEffect(() => {
    configureAuthorization({
      getAccessToken: () => tokenRef.current,
      refreshAccessToken,
    });

    return () => configureAuthorization(null);
  }, [refreshAccessToken]);
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `pnpm test:ci src/lib/api.test.ts src/modules/auth`
Expected: PASS.

- [ ] **Step 7: Verify the whole tree is still green**

Run: `pnpm check && pnpm test:ci`
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib src/modules/auth/context/AuthContext.tsx
git commit -m "$(cat <<'EOF'
feat: refresh once and repeat the request, instead of ending the session

The handler's three answers are the whole contract: a token means retry, null
means the session is over and was already cleared, and a rejection means the
refresh itself failed with the session intact — which is what stops a lost
connection from being read as a logout.

No per-request opt-out flag is needed. The API gives every failure its own
code, so only INVALID_ACCESS_TOKEN starts a refresh, and only /auth/me and
/auth/logout-all can produce it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The two sign-outs

**Files:**
- Modify: `src/modules/auth/types.ts`
- Modify: `src/modules/auth/context/AuthContext.tsx`
- Test: `src/modules/auth/context/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `logout`, `logoutEverywhere` (Task 3), `readRefreshToken`, `endSession` (Task 4).
- Produces: `AuthContextValue.signOutEverywhere: () => Promise<void>` and `AuthContextValue.isSigningOut: boolean`, both reached through `useAuth()`. Task 7 renders them.

- [ ] **Step 1: Write the failing tests**

In `src/modules/auth/context/AuthContext.test.tsx`, add `logout` and `logoutEverywhere` to the `../api/authApi` import, then their handles beside the existing ones:

```ts
const mockLogout = logout as jest.MockedFunction<typeof logout>;
const mockLogoutEverywhere = logoutEverywhere as jest.MockedFunction<typeof logoutEverywhere>;
```

Then add a probe button and the four tests.

Probe additions:

```ts
const SIGN_OUT_EVERYWHERE_LABEL = 'probe-sign-out-everywhere';
```

```tsx
      <Pressable
        onPress={() => {
          void signOutEverywhere().catch(() => undefined);
        }}
      >
        <Text>{SIGN_OUT_EVERYWHERE_LABEL}</Text>
      </Pressable>
```

destructured as `const { status, user, signIn, signUp, signOut, signOutEverywhere } = useAuth();`.

Tests, replacing the sign-out test written in Task 4:

```ts
  it('signs out, revoking this device session on the server', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: ROTATED_REFRESH_TOKEN,
    });
    mockFetchMe.mockResolvedValue(PROFILE);
    mockLogout.mockResolvedValue(undefined);

    await renderAuth();
    await screen.findByText('status:signedIn');
    await fireEvent.press(screen.getByText(SIGN_OUT_LABEL));

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    expect(await screen.findByText('user:none')).toBeTruthy();
    // The token the rotation left behind, not the one boot started with.
    expect(mockLogout).toHaveBeenCalledWith(ROTATED_REFRESH_TOKEN);
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  it('still signs out locally when the logout call fails', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: ROTATED_REFRESH_TOKEN,
    });
    mockFetchMe.mockResolvedValue(PROFILE);
    mockLogout.mockRejectedValue(
      new ApiError({
        status: 0,
        code: API_ERROR_CODES.NETWORK_ERROR,
        message: 'The request did not reach the API.',
      }),
    );

    await renderAuth();
    await screen.findByText('status:signedIn');
    await fireEvent.press(screen.getByText(SIGN_OUT_LABEL));

    // Trapping a user in a signed-in app because the device is offline is worse
    // than a refresh token that stays live until it expires — and the local
    // clear removes the only copy of it anyway.
    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  it('signs out everywhere, ending the local session too', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: ROTATED_REFRESH_TOKEN,
    });
    mockFetchMe.mockResolvedValue(PROFILE);
    mockLogoutEverywhere.mockResolvedValue(undefined);

    await renderAuth();
    await screen.findByText('status:signedIn');
    await fireEvent.press(screen.getByText(SIGN_OUT_EVERYWHERE_LABEL));

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    expect(mockLogoutEverywhere).toHaveBeenCalledTimes(1);
    await expect(readRefreshToken()).resolves.toBeNull();
  });

  it('keeps the session when signing out everywhere fails', async () => {
    await writeRefreshToken(REFRESH_TOKEN);
    mockRefreshSession.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: ROTATED_REFRESH_TOKEN,
    });
    mockFetchMe.mockResolvedValue(PROFILE);
    mockLogoutEverywhere.mockRejectedValue(
      new ApiError({
        status: 0,
        code: API_ERROR_CODES.NETWORK_ERROR,
        message: 'The request did not reach the API.',
      }),
    );

    await renderAuth();
    await screen.findByText('status:signedIn');
    await fireEvent.press(screen.getByText(SIGN_OUT_EVERYWHERE_LABEL));

    // The promise is EVERY device. Degrading to a local sign-out would tell the
    // user their other sessions ended when they did not.
    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    await expect(readRefreshToken()).resolves.toBe(ROTATED_REFRESH_TOKEN);
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test:ci src/modules/auth/context/AuthContext.test.tsx`
Expected: FAIL — `signOutEverywhere` does not exist on the context value.

- [ ] **Step 3: Extend the context type**

In `src/modules/auth/types.ts`, inside `AuthContextValue`:

```ts
  signOut: () => Promise<void>;
  /**
   * Ends every session of this account. Unlike `signOut` it rejects on failure
   * and keeps this session: its promise is every device, and a silent
   * degradation to a local sign-out would be a lie.
   */
  signOutEverywhere: () => Promise<void>;
  isSubmitting: boolean;
  /** True while either sign-out is in flight. Separate from `isSubmitting`, which is the credential forms. */
  isSigningOut: boolean;
```

- [ ] **Step 4: Implement both sign-outs**

In `src/modules/auth/context/AuthContext.tsx`, add `logout` and `logoutEverywhere` to the `../api/authApi` import, replace the `signOut` callback with two mutations, and extend the memoised value:

```ts
  const signOutMutation = useMutation({
    mutationFn: async () => {
      const stored = await readRefreshToken();

      // Best effort: a failure here must not keep the user signed in. The local
      // clear below removes the only copy of the token either way.
      if (stored !== null) await logout(stored).catch(() => undefined);

      await endSession();
      queryClient.clear();
    },
    networkMode: 'always',
  });

  const signOutEverywhereMutation = useMutation({
    mutationFn: async () => {
      // Deliberately uncaught: the caller renders the failure and the session
      // survives, so the user can retry or use the plain sign-out.
      await logoutEverywhere();
      await endSession();
      queryClient.clear();
    },
    networkMode: 'always',
  });
```

```ts
  const value = useMemo<AuthContextValue>(
    () => ({
      status: resolveStatus({ hasCompletedBoot, token, user }),
      user,
      signIn: signInMutation.mutateAsync,
      signUp: signUpMutation.mutateAsync,
      signOut: signOutMutation.mutateAsync,
      signOutEverywhere: signOutEverywhereMutation.mutateAsync,
      isSubmitting: signInMutation.isPending || signUpMutation.isPending,
      isSigningOut: signOutMutation.isPending || signOutEverywhereMutation.isPending,
    }),
    [
      hasCompletedBoot,
      token,
      user,
      signInMutation.mutateAsync,
      signInMutation.isPending,
      signUpMutation.mutateAsync,
      signUpMutation.isPending,
      signOutMutation.mutateAsync,
      signOutMutation.isPending,
      signOutEverywhereMutation.mutateAsync,
      signOutEverywhereMutation.isPending,
    ],
  );
```

`mutateAsync` returns `Promise<void>` here because both mutation functions resolve to `void`; no cast is needed.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm test:ci src/modules/auth`
Expected: PASS.

- [ ] **Step 6: Verify the whole tree is still green**

Run: `pnpm check && pnpm test:ci`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/modules/auth
git commit -m "$(cat <<'EOF'
feat: end this session on the server, or end all of them

The two differ on failure, deliberately. signOut is best effort and always
clears locally: trapping a user in a signed-in app because the device is
offline is worse than a refresh token that lives until it expires.

signOutEverywhere rethrows and keeps the session. Its promise is every device,
and degrading silently to a local sign-out would tell the user their other
sessions ended when they did not.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: A surface for both sign-outs

`signOut` has existed on the context since the auth module shipped and no screen has ever called it. `HomeScreen` is a placeholder; it gains both actions.

**Files:**
- Modify: `src/screens/HomeScreen.tsx`
- Test: `src/screens/HomeScreen.test.tsx` (create)

**Interfaces:**
- Consumes: `useAuth()` (Task 6), `useErrorToast()` from `@/errors`.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Create `src/screens/HomeScreen.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useErrorToast } from '@/errors';
import { useAuth } from '@/modules/auth';

import { HomeScreen } from './HomeScreen';

jest.mock('@/modules/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/errors', () => ({ useErrorToast: jest.fn() }));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseErrorToast = useErrorToast as jest.MockedFunction<typeof useErrorToast>;

const SIGN_OUT_LABEL = 'Sign out';
const SIGN_OUT_EVERYWHERE_LABEL = 'Sign out everywhere';
const CONFIRM_LABEL = 'Sign out';

const givenSession = (overrides: Partial<ReturnType<typeof useAuth>> = {}) => {
  const signOut = jest.fn(async () => undefined);
  const signOutEverywhere = jest.fn(async () => undefined);

  mockUseAuth.mockReturnValue({
    status: 'signedIn',
    user: null,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut,
    signOutEverywhere,
    isSubmitting: false,
    isSigningOut: false,
    ...overrides,
  } as ReturnType<typeof useAuth>);

  return { signOut, signOutEverywhere };
};

/** Runs the destructive button of the last Alert the screen raised. */
const confirmTheAlert = async () => {
  const alertSpy = Alert.alert as jest.MockedFunction<typeof Alert.alert>;
  const buttons = alertSpy.mock.calls[0][2];

  await buttons?.find((button) => button.text === CONFIRM_LABEL)?.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockUseErrorToast.mockReturnValue({ showError: jest.fn() });
});

describe('HomeScreen', () => {
  it('signs out of this device without asking', async () => {
    const { signOut } = givenSession();

    await render(<HomeScreen />);
    await fireEvent.press(screen.getByText(SIGN_OUT_LABEL));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('asks before ending every session, and does nothing until confirmed', async () => {
    const { signOutEverywhere } = givenSession();

    await render(<HomeScreen />);
    await fireEvent.press(screen.getByText(SIGN_OUT_EVERYWHERE_LABEL));

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(signOutEverywhere).not.toHaveBeenCalled();

    await confirmTheAlert();

    expect(signOutEverywhere).toHaveBeenCalledTimes(1);
  });

  it('shows the failure of signing out everywhere, which keeps the session', async () => {
    const showError = jest.fn();
    mockUseErrorToast.mockReturnValue({ showError });
    const failure = new Error('offline');
    givenSession({ signOutEverywhere: jest.fn(async () => Promise.reject(failure)) });

    await render(<HomeScreen />);
    await fireEvent.press(screen.getByText(SIGN_OUT_EVERYWHERE_LABEL));
    await confirmTheAlert();

    expect(showError).toHaveBeenCalledWith(failure);
  });

  it('disables both buttons while a sign-out is in flight', async () => {
    givenSession({ isSigningOut: true });

    await render(<HomeScreen />);

    expect(signOutButton()).toBeDisabled();
    expect(signOutEverywhereButton()).toBeDisabled();
  });
});
```

Those two queries are by role, so they return the `Pressable` itself rather than the `Text` inside it — which is what both `toBeDisabled()` and `fireEvent.press` want. Declare them beside the other helpers:

```tsx
const BUTTON_ROLE = 'button';

const signOutButton = () => screen.getByRole(BUTTON_ROLE, { name: SIGN_OUT_LABEL });
const signOutEverywhereButton = () =>
  screen.getByRole(BUTTON_ROLE, { name: SIGN_OUT_EVERYWHERE_LABEL });
```

`name` matches the accessible name exactly, so `'Sign out'` finds only the first button even though `'Sign out everywhere'` begins with the same words. Use these two helpers in place of `screen.getByText(...)` in the three press tests above as well.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test:ci src/screens/HomeScreen.test.tsx`
Expected: FAIL — no button is rendered.

- [ ] **Step 3: Write the screen**

Replace `src/screens/HomeScreen.tsx`:

```tsx
import { Alert, Pressable, Text, View } from 'react-native';

import { useErrorToast } from '@/errors';
import { useAuth } from '@/modules/auth';

const COPY = {
  title: 'Signed-in area',
  signOutLabel: 'Sign out',
  signOutEverywhereLabel: 'Sign out everywhere',
  confirmTitle: 'Sign out everywhere?',
  confirmMessage: 'Every device signed in to this account will be signed out.',
  confirmLabel: 'Sign out',
  cancelLabel: 'Cancel',
} as const;

export const HomeScreen = () => {
  const { signOut, signOutEverywhere, isSigningOut } = useAuth();
  const { showError } = useErrorToast();

  const confirmSignOutEverywhere = () => {
    Alert.alert(COPY.confirmTitle, COPY.confirmMessage, [
      { text: COPY.cancelLabel, style: 'cancel' },
      {
        text: COPY.confirmLabel,
        style: 'destructive',
        onPress: () => {
          // This one rejects on failure and keeps the session, so the rejection
          // has to reach the toast instead of going unhandled.
          void signOutEverywhere().catch(showError);
        },
      },
    ]);
  };

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text className="text-2xl font-semibold text-content">{COPY.title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isSigningOut }}
        className="w-full items-center rounded-lg bg-primary px-4 py-3 active:bg-primary-pressed"
        disabled={isSigningOut}
        onPress={() => {
          // Cannot reject by construction: it swallows the server call's failure.
          void signOut();
        }}
      >
        <Text className="text-base font-semibold text-content-inverse">{COPY.signOutLabel}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isSigningOut }}
        className="w-full items-center rounded-lg border border-danger px-4 py-3"
        disabled={isSigningOut}
        onPress={confirmSignOutEverywhere}
      >
        <Text className="text-base font-semibold text-danger">
          {COPY.signOutEverywhereLabel}
        </Text>
      </Pressable>
    </View>
  );
};
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm test:ci src/screens/HomeScreen.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify the whole tree is still green**

Run: `pnpm check && pnpm test:ci`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/screens
git commit -m "$(cat <<'EOF'
feat: let the user actually sign out

signOut has been on the context since the auth module shipped and no screen
ever called it. Both actions land on the placeholder Home screen rather than in
a new Account route: AppStack has a single route, and inventing navigation for
a boilerplate that has none is a decision for whoever clones it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Documentation

Rule 3 wants a module's README updated in the change that alters its exports; this task collects what the previous seven changed, plus the cross-cutting documents.

**Files:**
- Modify: `src/modules/auth/README.md`, `src/lib/README.md`, `src/errors/README.md`, `src/screens/README.md`
- Modify: `ARCHITECTURE.md`, `README.md`
- Modify: `docs/superpowers/specs/2026-09-01-auth-module-design.md`

- [ ] **Step 1: Update `src/modules/auth/README.md`**

Portuguese prose, English identifiers.

- `## Hooks`: `useAuth()` now returns `{ status, user, signIn, signUp, signOut, signOutEverywhere, isSubmitting, isSigningOut }`.
- `## Constants`: unchanged (`AUTH_STATUSES`).
- Opening paragraph: it now speaks to six `/auth` endpoints, not three.
- Delete the whole `## Não existe ainda` section.
- Add to `## Conventions`:
  - **O access token nunca vai para o disco.** O SecureStore guarda só o refresh token; o access vive em memória enquanto o processo existir. O boot restaura a sessão gastando o refresh token, não confiando num access guardado.
  - **Refresh é single-flight.** A API exige: dois refresh concorrentes com o mesmo token devolvem dois tokens e só o último emitido continua válido. `createSingleFlight` em `utils/` é o que garante isso.
  - **O token rotacionado é gravado antes de o refresh resolver.** Se o processo morrer nesse intervalo, o disco fica com um token gasto — é exatamente o que a janela de graça de 30 segundos da API perdoa.
  - **`signOut` engole a falha; `signOutEverywhere` não.** O primeiro sempre sai localmente (prender o usuário logado por estar offline é pior); o segundo mantém a sessão e relança, porque a promessa é "todos os dispositivos".
  - Replace the old bullet about `isRejectedToken` with `isEndedSession`, noting it delegates to `classifyError`.

- [ ] **Step 2: Update `src/lib/README.md`**

Document the new `AuthorizationHandlers` shape and the retry: um `401 INVALID_ACCESS_TOKEN` chama `refreshAccessToken()` e repete a request uma vez; `null` propaga o erro original; uma rejeição propaga o erro do refresh. Note that this layer knows nothing about refresh tokens or storage.

- [ ] **Step 3: Update `src/errors/README.md` and `src/screens/README.md`**

`errors/`: the three new codes and that `classifyError` now treats the two refresh 401s as `SESSION`. `screens/`: `HomeScreen` now renders the two sign-out actions.

- [ ] **Step 4: Update `ARCHITECTURE.md` and `README.md`**

`ARCHITECTURE.md` §10: remove token refresh and server-side logout from the pending list. `README.md`: the Auth roadmap item loses its "refresh deferred" note.

- [ ] **Step 5: Mark §9 of the auth spec delivered**

In `docs/superpowers/specs/2026-09-01-auth-module-design.md`, in `### 9. The refresh seam`, add a leading note: this section was delivered on 2026-09-03 by `2026-09-03-auth-refresh-logout-design.md`, and record the one place the prediction was wrong — the seam held, but `storage.ts` did not gain the refresh token *alongside* the access token; it replaced it, because the access token stopped being persisted at all (D4).

- [ ] **Step 6: Verify**

Run: `pnpm check && pnpm test:ci`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs: record what the refresh slice changed

§9 of the auth module design predicted the seam correctly and one detail
wrong: storage.ts did not gain the refresh token alongside the access token,
it replaced it — the access token stopped being persisted at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verification

Runnable in this environment, after every task: `pnpm check` and `pnpm test:ci`.

Not runnable here: WSL2 has no Xcode, Android SDK or Maestro CLI, and the API needs Postgres. Three behaviours need a device and a live `api-clean-platform`, because a fake cannot prove them:

1. Two screens loading at once after the access token expires produce exactly **one** `/auth/refresh` call.
2. Killing the app between the refresh response and the storage write recovers on the next launch, inside the API's 30-second grace window.
3. A `logout-all` from one device signs a second one out within the access token's TTL — not instantly. The API keeps the database off the authenticated path, so revocation latency is by design.
