# Auth refresh and server-side logout

**Date:** 2026-09-03
**Status:** Approved

## Goal

Close the seam that [§9 of the auth module design](2026-09-01-auth-module-design.md)
reserved. The API now has `POST /auth/refresh`, `POST /auth/logout` and
`POST /auth/logout-all`, so the three consequences of their absence go away: a
session no longer dies after one hour, signing out no longer leaves a live
refresh token in the database for sixty days, and a user can end every session
of their account from the device in their hand.

That section is this slice's acceptance criterion, and it is deliberately
narrow: the client work is a queue, a storage change and two endpoint calls —
not a rewrite of how the app authenticates.

## What the API now offers

Read from `api-clean-platform` at commit `b6a43a1`.

| Endpoint | Contract that matters here |
| --- | --- |
| `POST /auth/login` | body gains `refreshTransport: 'body' \| 'cookie'` (default `body`); answers `{ accessToken, refreshToken? }` — `refreshToken` present exactly in body mode |
| `POST /auth/refresh` | body `{ refreshToken? }` → `{ accessToken, refreshToken? }`. **Rotating**: the presented token is spent. 30-second grace window for a lost response. Reuse outside that window revokes the whole family |
| `POST /auth/logout` | body `{ refreshToken? }` → 204. Revokes this session's family only. Idempotent for any token presented; 401 when none is |
| `POST /auth/logout-all` | Bearer, no body → 204. Revokes every refresh token of the user |
| `GET /auth/me` | unchanged |

New error codes: `INVALID_REFRESH_TOKEN` (401, unknown/expired/absent),
`REFRESH_TOKEN_REUSED` (401, the family has just been revoked) and
`TRANSACTION_CONFLICT` (503 with `Retry-After`, from the three endpoints that
open a transaction).

**The API imposes one requirement on this client, in writing:** refresh calls
must be single-flight — one in flight at a time, with later callers awaiting
the same result. Two concurrent refreshes of the same token return two
different tokens and only the last one issued stays valid, so a client that
keeps the other is signed out on its next refresh.

## Scope

In:

- Persist the refresh token; stop persisting the access token.
- A single-flight refresh, and one automatic retry of the request that
  triggered it.
- Boot restores the session through a refresh instead of a stored access token.
- `signOut` calls `POST /auth/logout`; a new `signOutEverywhere` calls
  `POST /auth/logout-all`.
- The two sign-out actions get a surface on `HomeScreen` — today `signOut`
  exists on the context and no screen calls it.
- The new error codes are classified and given copy.

Out (full list in the last section): cookie transport on the web target,
proactive refresh scheduled from the JWT's `exp`, rate limiting.

## Decisions

### D1 — The queue lives in the auth module; the retry lives in the client

`src/lib/api.ts` learns to *retry after a refresh*. It does not learn *how to
refresh*: it calls a handler and awaits it. The queue, the rotation, the write
to secure storage and the decision of what `REFRESH_TOKEN_REUSED` means all
stay in `src/modules/auth/`.

Putting the queue in `api.ts` would have been shorter — one file, no new
contract — and was rejected on the boundary rule: `src/lib/**` may hold no
module knowledge, and "which failures end a session" is exactly that. It also
makes the queue testable as a pure function instead of through a swapped axios
adapter.

Considered and rejected: **proactive refresh**, scheduled from the access
token's `exp`. It requires decoding the JWT in the client, against what
`api/schemas.ts` already fixed ("presence, not shape: the client has no
business asserting JWT structure"), and it does not remove the reactive path —
an app returning from the background finds the token dead regardless.

### D2 — `onUnauthorized` leaves the contract

```ts
export interface AuthorizationHandlers {
  getAccessToken: () => string | null;
  /**
   * Resolves with a fresh access token, or null when the session is over — in
   * which case the handler has ALREADY ended it locally. Rejects only when the
   * refresh failed for a reason that is not the session (offline, 503).
   */
  refreshAccessToken: () => Promise<string | null>;
}
```

The handler is the only code that sees the `/auth/refresh` response, so it is
the only code that can tell a dead session from a dead radio. Keeping
`onUnauthorized` alongside it would give the same ending two owners, and the
one in `api.ts` would be guessing.

The three-way answer is the whole point: **a token** means retry, **null**
means the session ended and was cleaned up, **a rejection** means the refresh
itself failed and the session is untouched. That last one is what stops being
offline from logging a user out.

### D3 — No `skipRefresh` flag: the API's distinct codes do the discriminating

The usual shape of this feature needs a per-request opt-out, so the interceptor
does not try to refresh the refresh call itself. Here it is unnecessary,
because the API gives every failure its own code: `/auth/refresh` and
`/auth/logout` fail with `INVALID_REFRESH_TOKEN`, `/auth/login` with
`INVALID_CREDENTIALS`. Only `INVALID_ACCESS_TOKEN` starts a refresh, and only
`/auth/me` and `/auth/logout-all` can produce it — precisely the two calls
worth retrying.

The one guard that remains is against a loop: a `hasRetriedAfterRefresh` flag
on the axios config, set on the repeat.

### D4 — The access token stops being persisted

Secure storage holds the refresh token and nothing else; the access token lives
in memory for the life of the process. This is what decision 11 of the API
prescribes ("access guardado em memória"), and it takes a credential that is
valid for a full hour off the disk.

The cost is one network call per cold start, and it buys a single boot path.
Persisting both was rejected for having two sources of truth and two boot
paths — with the stored access token usually expired anyway, since it outlives
the process by at most an hour.

Offline behaviour does not regress: today a cold start with no network already
lands on the sign-in screen, because `resolveStatus` requires a user and
`/auth/me` cannot answer.

### D5 — Secure storage is the only source of truth for the refresh token

No ref, no state mirroring it. The refresh runner reads it from storage on
every call — once an hour, not a hot path — which removes by construction any
chance of memory and disk disagreeing about which token in a rotation is
current.

The write of the rotated token happens **before** the runner resolves. If the
process dies in that gap, the disk holds a spent token: the API's 30-second
grace window exists for exactly this, and past it the next refresh trips reuse
detection and signs the user out. That is the correct outcome for a token whose
successor was lost, not a defect to paper over.

### D6 — `refreshTransport: 'body'` on both targets, sent explicitly

The native targets have no cookie jar, and the web target is a development
convenience — `storage.web.ts` already says `localStorage` is not equivalent to
the keychain. Cookie mode would additionally need `withCredentials`, a
credentialed CORS allowlist, and it cannot be exercised from Safari over
`http://localhost` at all (the API measured this: WebKit refuses a `Secure`
cookie there).

Sent explicitly rather than relying on the server's default: the client depends
on `refreshToken` being in the body, so it should say so, and a change of
default on the other side then breaks nothing.

Consequence for the response schema: `refreshToken` is **required**, not
optional. The API declares it optional because one schema serves both
transports; for this client an answer without it is contract drift and should
be loud.

### D7 — `signOut` is best-effort; `signOutEverywhere` is not

`signOut` attempts `POST /auth/logout`, swallows any failure, and always ends
the session locally. Trapping a user in a signed-in app because the device is
offline is worse than a refresh token that stays live until it expires — and
the local clear already removes the only copy of it.

`signOutEverywhere` does the opposite: on failure it rethrows and **keeps** the
local session. Its promise is every device; degrading silently to a local
sign-out would tell the user their other sessions ended when they did not. The
screen shows the error, and the plain sign-out is still there.

### D8 — The two actions live on `HomeScreen`, and `SubmitButton` is not promoted

`AppStack` has a single route and `HomeScreen` is a placeholder, so a dedicated
`Account` screen would be inventing navigation for a boilerplate that has none.
Two buttons go on the screen that exists; whoever clones the template moves
them.

They use `Pressable` with NativeWind classes rather than the module's
`SubmitButton`. Rule 5 promotes a component to `src/components/` when a
**second module** needs it, and `src/screens/` is not a module. Promoting it is
a defensible slice of its own; it is not this one.

### D9 — No migration for the orphaned `auth.accessToken` key

The old key stays in the keychain of any device that ran a previous build,
unread by anything. This is a boilerplate with no installed base, and writing
migration code for zero users is worse than an orphaned key.

## Design

### 1. `src/lib/api.ts`

`API_ERROR_CODES` gains `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_REUSED` and
`TRANSACTION_CONFLICT`. `AuthorizationHandlers` takes the shape in D2.

`toApiError` loses its session branch — it goes back to being a pure
translation from `AxiosError` to `ApiError`, with no side effect. The response
interceptor becomes async and owns the retry:

```ts
interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  /** Set on the repeat, so a second 401 cannot start another refresh. */
  hasRetriedAfterRefresh?: boolean;
}

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

  // A rejection here is NOT a dead session — it is the refresh's own failure
  // (offline, 503), and it propagates instead of the original 401 so the
  // caller sees why it really failed.
  const accessToken = await handlers.refreshAccessToken();

  if (accessToken === null) throw apiError;

  return axiosInstance.request({ ...config, hasRetriedAfterRefresh: true });
});
```

The repeat goes through the request interceptor again, so it picks up the new
token from `getAccessToken()` — the runner has already applied it by the time
it resolves.

### 2. `src/modules/auth/utils/singleFlight.ts`

A factory with no React and no network, testable directly:

```ts
export const createSingleFlight = <TResult>(run: () => Promise<TResult>) => {
  let inFlight: Promise<TResult> | null = null;

  return (): Promise<TResult> => {
    inFlight ??= run().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
};
```

Every caller that arrives while a call is in flight receives the same promise —
resolution and rejection alike. The slot clears when the run settles, so the
next call starts a fresh one.

### 3. Storage and constants

`constants.ts`: `ACCESS_TOKEN_STORAGE_KEY` is removed;
`REFRESH_TOKEN_STORAGE_KEY = 'auth.refreshToken'` replaces it.

`storage.ts` and `storage.web.ts` expose `readRefreshToken`,
`writeRefreshToken` and `clearRefreshToken`, keeping their current split
(`expo-secure-store` natively, `localStorage` on the web with the same warning
already in the file).

### 4. `src/modules/auth/api/`

`schemas.ts` replaces `loginResponseSchema` with a shape both `login` and
`refresh` answer:

```ts
export const sessionTokensSchema = z.object({
  accessToken: z.string().min(MIN_TOKEN_LENGTH),
  refreshToken: z.string().min(MIN_TOKEN_LENGTH),
});

export type SessionTokens = z.infer<typeof sessionTokensSchema>;
```

`authApi.ts` — `login` changes shape, three calls are added:

```ts
/** Body transport, stated rather than inherited from the server default — D6. */
const REFRESH_TRANSPORT_BODY = 'body';

export const login = async (credentials: Credentials): Promise<SessionTokens> => {
  const payload = await api.post('/auth/login', {
    ...credentials,
    refreshTransport: REFRESH_TRANSPORT_BODY,
  });

  return parseOrThrow(sessionTokensSchema, payload);
};

/** The presented token is spent: the pair returned replaces it, both halves. */
export const refreshSession = async (refreshToken: string): Promise<SessionTokens> => {
  const payload = await api.post('/auth/refresh', { refreshToken });

  return parseOrThrow(sessionTokensSchema, payload);
};

/** Ends this device's session only. Answers 204, so there is nothing to parse. */
export const logout = async (refreshToken: string): Promise<void> => {
  await api.post('/auth/logout', { refreshToken });
};

/** Ends every session of the account. Authorized by the bearer token. */
export const logoutEverywhere = async (): Promise<void> => {
  await api.post('/auth/logout-all');
};
```

### 5. `src/modules/auth/utils/session.ts`

`isRejectedToken` becomes `isEndedSession`, covering the three codes that mean
the session is over rather than the one:

```ts
const ENDED_SESSION_CODES: readonly string[] = [
  API_ERROR_CODES.INVALID_ACCESS_TOKEN,
  API_ERROR_CODES.INVALID_REFRESH_TOKEN,
  API_ERROR_CODES.REFRESH_TOKEN_REUSED,
];

export const isEndedSession = (error: unknown): boolean =>
  error instanceof ApiError && ENDED_SESSION_CODES.includes(error.code);
```

`resolveStatus` is unchanged: `token` there means the in-memory access token,
and "a token alone is not a session" still holds.

### 6. `AuthProvider`

`endSession` clears the refresh token instead of the access token. The runner
and its queue are built once and registered:

```ts
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

        // Written BEFORE resolving — D5.
        await writeRefreshToken(refreshToken);
        applyToken(accessToken);

        return accessToken;
      } catch (error) {
        // Anything that is not the session ending — offline, 503 — belongs to
        // the caller, with the session left intact.
        if (!isEndedSession(error)) throw error;

        await endSession();

        return null;
      }
    }),
  [applyToken, endSession],
);
```

Boot replaces "restore the stored access token" with "spend the stored refresh
token":

```
read refresh token
├─ null            → boot over, signedOut
└─ present         → refreshAccessToken()
   ├─ a token      → applyToken; meQuery runs; boot ends when it settles
   ├─ null         → storage already cleared by the runner; boot over, signedOut
   └─ a rejection  → reportError(error) for the offline toast; boot over,
                     signedOut; the refresh token is KEPT
```

The last branch is why `AuthProvider` imports `reportError` from `@/errors`:
the boot refresh is not a TanStack Query call, so the global `QueryCache`
callback that toasts a failed boot `/auth/me` today cannot see it. The boundary
table allows it — `errors/` never imports a module; the reverse is fine.

`establishSession` writes the refresh token before applying the access token,
then `fetchQuery` for `/auth/me` exactly as today.

The effect that watches `meQuery.error` stays, now using `isEndedSession`. It
is a narrower net than before but not dead code: a `/auth/me` that still
answers 401 *after* a successful refresh and retry has no other owner.

Two mutations are added, matching the existing `signIn`/`signUp` shape with
`networkMode: 'always'`:

```ts
const signOutMutation = useMutation({
  mutationFn: async () => {
    const stored = await readRefreshToken();

    // Best effort — D7. A failure here must not keep the user signed in.
    if (stored !== null) await logout(stored).catch(() => undefined);

    await endSession();
    queryClient.clear();
  },
  networkMode: 'always',
});

const signOutEverywhereMutation = useMutation({
  mutationFn: async () => {
    // No catch — D7. The caller renders the failure and the session survives.
    await logoutEverywhere();
    await endSession();
    queryClient.clear();
  },
  networkMode: 'always',
});
```

### 7. `types.ts` and `index.ts`

`AuthContextValue` gains:

```ts
  /** Ends every session of this account. Rejects — and keeps this session — on failure. */
  signOutEverywhere: () => Promise<void>;
  isSigningOut: boolean;
```

`isSigningOut` is true while either sign-out is pending, and stays separate
from `isSubmitting`, which belongs to the credential forms.

`index.ts` is unchanged in shape: nothing new leaves the module. `SessionTokens`,
`createSingleFlight` and the api functions are implementation detail.

### 8. `src/errors/`

`classify.ts` — the session branch keys off `isEndedSession`'s code set rather
than a single code. This fixes a latent defect: today a 401 carrying any other
code falls through to the `>= 400` catch-all and is classified `INPUT`, which
would render "Please check the fields above." for a session that just ended.

`TRANSACTION_CONFLICT` needs no classification work — it arrives with 503, so
the existing `>= 500` branch already makes it `SERVER` and therefore retryable.

`errorCopy.ts` in the auth module gains the two domain entries:

```ts
  INVALID_REFRESH_TOKEN: 'Your session has expired. Please sign in again.',
  REFRESH_TOKEN_REUSED: 'Your session was ended for security. Please sign in again.',
```

`BASE_COPY` in `src/errors/copy.ts` gains `TRANSACTION_CONFLICT`: 'The server
is busy. Please try again.'

### 9. `src/screens/HomeScreen.tsx`

Two `Pressable` buttons and a local `COPY` object. The destructive one confirms
first:

```tsx
const COPY = {
  title: 'Signed-in area',
  signOutLabel: 'Sign out',
  signOutEverywhereLabel: 'Sign out everywhere',
  confirmTitle: 'Sign out everywhere?',
  confirmMessage: 'Every device signed in to this account will be signed out.',
  confirmLabel: 'Sign out',
  cancelLabel: 'Cancel',
} as const;
```

`signOutEverywhere` is wrapped so its rejection reaches
`useErrorToast().showError(error)` rather than becoming an unhandled rejection;
`signOut` cannot reject by construction (D7). Both buttons are disabled while
`isSigningOut`.

## Testing

Colocated, jest-expo + React Native Testing Library, `render()` and
`fireEvent.*()` awaited (Rule 8).

| File | Proves |
| --- | --- |
| `src/modules/auth/utils/singleFlight.test.ts` | two concurrent calls run the work once and both receive it; a call after settling starts a new run; a rejection reaches every waiter |
| `src/lib/api.test.ts` | a 401 `INVALID_ACCESS_TOKEN` refreshes and repeats with the new token; it repeats at most once; a null refresh propagates the original error; a rejected refresh propagates the refresh's error; a 401 `INVALID_CREDENTIALS` never refreshes |
| `src/modules/auth/api/authApi.test.ts` | each new call hits the right path and method; `login` sends `refreshTransport: 'body'`; a response missing `refreshToken` throws contract drift |
| `src/modules/auth/api/schemas.test.ts` | `sessionTokensSchema` rejects an empty or absent token on either half |
| `src/modules/auth/utils/session.test.ts` | `isEndedSession` recognises the three codes and nothing else |
| `src/modules/auth/context/AuthContext.test.tsx` | boot with no refresh token → `signedOut`; boot with a valid one → `signedIn`; boot with a rejected one → storage cleared; boot offline → `signedOut` with the token kept; a rotation writes the new token before resolving; `signOut` offline still signs out; `signOutEverywhere` that fails keeps the session |
| `src/errors/classify.test.ts` | both refresh codes classify as `SESSION`, not `INPUT` |
| `src/screens/HomeScreen.test.tsx` | each button calls its action; the destructive one confirms first; both are disabled while signing out |

## Documentation

Updated in the same change that creates the code, never after:

- `src/modules/auth/README.md` — remove "Não existe ainda"; document
  `signOutEverywhere`/`isSigningOut`, the memory-only access token, the
  single-flight rule and the two logout policies of D7.
- `src/lib/README.md` — the new `AuthorizationHandlers` contract and the retry.
- `src/errors/README.md` — the new codes.
- `src/screens/README.md` — what `HomeScreen` now does.
- `ARCHITECTURE.md` §10 — remove refresh and server-side logout from pending.
- `README.md` — the Auth roadmap item loses its "refresh deferred" note.
- `docs/superpowers/specs/2026-09-01-auth-module-design.md` — §9 marked as
  delivered by this spec.

## Delivery slices

Each ends green on `pnpm check` and `pnpm test:ci`. The order is dictated by
what compiles: the contract change in slice 3 spans four files that reference
each other, so splitting it further would mean landing a slice that does not
typecheck.

1. **Additive foundation.** `utils/singleFlight.ts` + test; the three new codes
   in `API_ERROR_CODES`; `isEndedSession` added to `utils/session.ts` beside
   the `isRejectedToken` it will replace + tests. Nothing is wired yet.
2. **The new calls.** `sessionTokensSchema` beside the `loginResponseSchema` it
   will replace; `refreshSession`, `logout` and `logoutEverywhere` in
   `authApi.ts` + tests. `login` is untouched here.
3. **The switch**, in one commit because it cannot be split: the
   `AuthorizationHandlers` contract and the retry in `src/lib/api.ts`; `login`
   returning `SessionTokens`; storage swapped from the access token to the
   refresh token; `AuthProvider`'s boot, runner and two sign-outs; `types.ts`.
   The superseded exports (`loginResponseSchema`, `isRejectedToken`, the
   access-token storage trio, `ACCESS_TOKEN_STORAGE_KEY`) are removed here, and
   the tests of all four files are updated with them.
4. **Errors.** The session code set in `classify.ts`, the two entries in
   `errorCopy.ts`, `TRANSACTION_CONFLICT` in `BASE_COPY` + tests.
5. **UI and documentation.** `HomeScreen` + test, then every document listed
   above.

## Verification

Runnable here: `pnpm check` and `pnpm test:ci` after every slice.

Not runnable here: WSL2 has no Xcode, Android SDK or Maestro CLI, and the API
needs Postgres. The rotation, the grace window and reuse detection are exercised
against fakes in Jest; end-to-end verification against a live
`api-clean-platform` happens outside this session.

Three behaviours are worth checking by hand there, because a fake cannot prove
them: two screens loading at once after the token expires produce exactly one
`/auth/refresh` call; killing the app between the refresh response and the
storage write recovers on the next launch inside the 30-second window; and a
`logout-all` from one device signs the second one out within the access token's
TTL, not instantly (the API keeps the database off the authenticated path).

## Out of scope / explicitly deferred

- **Cookie transport on the web target** — D6. The web build stays a
  development convenience.
- **Proactive refresh from the JWT `exp`** — D1.
- **Promoting `SubmitButton` to `src/components/`** — D8.
- **Rate limiting** — the API has the slice pending; no `429` exists yet, so
  there is nothing to classify or retry against.
- **A dedicated account screen, session listing, or per-device revocation** —
  the API exposes no endpoint to enumerate sessions.
- **Password reset, email verification, social login, biometrics** — unchanged
  from the auth module spec: no endpoints.
- **Maestro flows** — still needs a dev-client build and a reachable API.
