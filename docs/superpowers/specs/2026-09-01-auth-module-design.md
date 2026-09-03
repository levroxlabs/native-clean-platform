# Auth module

**Date:** 2026-09-01
**Status:** Approved

## Goal

Build the first domain module of this boilerplate — `src/modules/auth/` — plus
the two shared pieces it forces into existence (an environment config and an
HTTP client), so that every app cloned from this repo starts with a working
session: sign up, sign in, a restored session on cold start, sign out, and a
navigation gate between the signed-out and signed-in stacks.

The target is a **correct and complete flow, not a polished UI**. Screens are
deliberately plain; what has to be right is the state machine, the error
contract, the token lifecycle, and the module boundaries every future app will
inherit.

## Scope

- The three auth endpoints that exist in `api-clean-platform` today:
  `POST /auth/register`, `POST /auth/login`, `GET /auth/me`.
- Session state, token persistence, and conditional navigation.
- Client-side form validation mirroring the API's published policy.
- The shared `src/config/` and `src/services/http/` modules auth depends on.
- Restructuring `src/navigation/` from a flat stack into a composition root.

**Not covered:** token refresh and server-side logout (no endpoint exists —
see [§9](#9-the-refresh-seam)), password reset, email verification, social
login, biometrics, i18n beyond the copy seam, and any polish of the screens'
visual design.

## The API contract

Read from `../api-clean-platform` at `932b5c3`. Route prefix `/auth`, server
default port `3000`.

| Endpoint | Request | Success | Errors |
| --- | --- | --- | --- |
| `POST /auth/register` | `{ email, password }` | `201 { id }` | `400 VALIDATION_ERROR`, `409 EMAIL_ALREADY_IN_USE` |
| `POST /auth/login` | `{ email, password }` | `200 { accessToken }` | `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS` |
| `GET /auth/me` | `Authorization: Bearer <token>` | `200 { id, email, emailVerifiedAt, createdAt }` | `401 INVALID_ACCESS_TOKEN`, `404 USER_NOT_FOUND` |

Every error, without exception, uses one envelope:

```json
{ "error": { "code": "…", "message": "…", "details": [{ "field": "…", "code": "…" }], "traceId": "…" } }
```

Three properties of this contract drive the design below:

1. **`code` is stable contract; `message` is not.** The API's own
   `app-error.ts` states it: `message` exists for logs and for clients without
   translations, and must never be rendered raw in a localized UI. So the
   client branches on `code` and owns its copy.
2. **`register` issues no session.** It answers `201 { id }` and nothing else;
   a client that wants the user signed in afterwards must call `login` itself.
3. **`GET /auth/me` is the only token validator the API offers.** There is no
   introspection endpoint, so "is this stored token still good?" is answered by
   calling `/auth/me` and reading the status.

Published validation policy, mirrored client-side: email trimmed, max 254
chars, valid format; password 8–128 chars matching
`/^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/` (at least one letter, one digit,
one non-alphanumeric). Access tokens are JWTs with a default TTL of 1 hour.

## Decisions

### D1 — TanStack Query for server state

`@tanstack/react-query` is added and a `QueryClientProvider` wraps the app.
`GET /auth/me` is a query; login, register, and the sign-up chain are
mutations.

**Alternative considered:** plain promises inside a Context, no dependency.
Sufficient for three endpoints, and rejected anyway: this repo is the base for
every app the team will build, and each of those will need cached server state
on its second screen. Making Query part of the boilerplate means the pattern is
established once, here, against the simplest possible domain — instead of being
retrofitted differently in each app.

### D2 — `react-hook-form` + `zod` for forms

The API publishes an exact password policy and returns per-field
`details: [{ field, code }]` on a 400. A zod schema mirrors that policy, and
`@hookform/resolvers` wires it into `react-hook-form`, which also owns the
per-field error rendering that the server's `details[]` feeds into via
`setError`.

**Alternative considered:** hand-rolled `useState` validation, or trusting the
API's 400 alone. Both rejected for the same reason as D1 — the boilerplate
should hand every future app one form pattern, not a placeholder each app
replaces.

### D3 — No token refresh; a documented seam instead

`/auth/refresh` and `/auth/logout` do not exist in the API yet, though the
API's own `config.ts` states the intent ("the refresh token carries the
session"). Building a single-flight refresh queue now would mean shipping the
client's most failure-prone code path against an invented contract, with no
integration test able to run against it.

So: **any `401` ends the session.** The HTTP client exposes one
`onUnauthorized` hook, registered by `AuthProvider`, and that hook is the sole
place to change when the endpoints land. See [§9](#9-the-refresh-seam) for what
that change looks like.

### D4 — Dates stay ISO strings

`createdAt` and `emailVerifiedAt` cross the wire as ISO 8601 strings (Fastify
serializes the handler's `Date` for us) and stay strings in the client's `User`
type. Nothing formats or compares a date yet; `z.coerce.date()` would add a
conversion whose only consumer would be the conversion itself.

### D5 — `auth` owns its navigator from day one

Per the repo's own `modularizing-react-navigation` skill, the per-module
navigation trio is set up *before* the flat file becomes a bottleneck when the
app is expected to grow past ~3 modules. This repo is cloned into every future
app, so that condition is met by construction, and `auth` is the first module
to bring screens.

## Design

### 1. `src/config/`

```
src/config/
  env.ts        API_BASE_URL — read and validated once, at module load
  index.ts
  README.md
```

`EXPO_PUBLIC_API_URL` is read from `.env`, which Expo SDK 57 loads natively —
no `app.config.ts` is introduced. `env.ts` validates it with zod at import
time and throws a message naming the missing variable, so a misconfigured app
fails at boot with a readable error instead of at the first request with a
`fetch` failure.

A committed `.env.example` documents the variable, including the note that an
Android emulator reaches the host machine at `10.0.2.2`, not `localhost`.
`.gitignore` already covers `.env*.local`; a line for `.env` is added.

### 2. `src/services/http/`

```
src/services/http/
  client.ts       request<T>() — base URL, JSON, Bearer, timeout
  ApiError.ts     the envelope, as a typed Error
  errorCodes.ts   API_ERROR_CODES — the API's stable codes, as a const object
  types.ts
  index.ts
  README.md
```

This module knows nothing about React and nothing about auth — `AGENTS.md`
Rule 5. It:

- prefixes `API_BASE_URL`, sets JSON headers, and serializes the body;
- attaches `Authorization: Bearer <token>` when a token provider is registered
  and returns one;
- aborts a request past `REQUEST_TIMEOUT_MS` via `AbortSignal.timeout`;
- on a non-2xx, parses the envelope and throws
  `ApiError { status, code, message, details, traceId }`; a body that is not
  the envelope (a proxy's HTML 502, say) still throws an `ApiError`, with a
  synthesized code, so callers only ever handle one error type;
- calls `onUnauthorized()` on a `401` before throwing.

The two React-facing dependencies enter through one registration function:

```ts
configureAuthorization({
  getAccessToken: () => string | null,
  onUnauthorized: () => void,
}): void
```

`AuthProvider` calls it once on mount. The name says `Authorization` — the
HTTP header — precisely because this module must not read as knowing the auth
module exists. This inverts the dependency — the HTTP
client never imports the auth module, so a second module protecting its own
routes gets the Bearer header for free without importing auth either.

### 3. `src/modules/auth/`

```
src/modules/auth/
  api/
    endpoints.ts        AUTH_ENDPOINTS — the three paths
    schemas.ts          zod: credentials, registerResponse, loginResponse, user
    authApi.ts          register() / login() / fetchMe()
  hooks/
    useAuth.ts          context consumer; throws outside the provider
  navigation/
    constants.ts        AUTH_ROUTES = { SIGN_IN, SIGN_UP }
    types.ts            AuthStackParamList
    AuthStack.tsx
  screens/
    SignInScreen.tsx
    SignUpScreen.tsx
  AuthProvider.tsx
  storage.ts            expo-secure-store
  storage.web.ts        localStorage fallback (see below)
  constants.ts          QUERY_KEYS, storage key, shared copy
  types.ts              User, AuthStatus, AuthContextValue
  index.ts
  README.md
```

`index.ts` exports exactly: `AuthProvider`, `useAuth`, `AuthStack`,
`AUTH_ROUTES`, and the types `AuthStackParamList`, `User`, `AuthStatus`.
Nothing else is reachable from outside.

`api/authApi.ts` holds three plain async functions over the HTTP client,
each parsing its response through the zod schema. Parsing responses (not just
requests) is deliberate: it turns a silent contract drift between the two repos
into a loud, located failure.

**Token storage.** `expo-secure-store` is the native implementation — the OS
keychain / keystore. It has no web support, and this repo supports `pnpm web`,
so `storage.web.ts` provides a `localStorage` implementation that Metro's
platform resolution picks automatically. Its README states plainly that web
storage is not equivalent in security and that the web target is a development
convenience, not a supported production surface.

### 4. Session state

```ts
type AuthStatus = 'loading' | 'signedOut' | 'signedIn';
```

`AuthProvider` owns the token in memory (state) and in storage, and derives the
user from a query:

**`loading` means boot, and only boot.** It covers reading storage and, if a
token was there, the first `/auth/me`. Once that settles the status is
`signedOut` or `signedIn` and never returns to `loading` — otherwise signing in
would unmount the sign-in screen into a full-screen splash mid-submit. Pending
sign-in and sign-up are reported through the mutations' own flags, which the
screens render on their submit buttons.

`signedIn` requires **both** a token and a loaded user; a token alone is not a
session, since only `/auth/me` can tell whether it still verifies.

- **Boot.** Read the stored token. None → `signedOut`. Present → hold it and
  let the `['auth', 'me']` query run (`enabled: token !== null`). `200` →
  `signedIn` with the user; `401` → clear storage → `signedOut`.
- **Sign in.** `useMutation(login)` → store the token → the `me` query becomes
  enabled and resolves → `signedIn`. The screen stays mounted, button pending,
  until the user arrives and the gate swaps.
- **Sign up.** One mutation chaining `register` → `login` → the same path as
  above. This is what the API's decision to not issue a session on register
  costs the client, and it is paid here once rather than in each app.
- **Sign out.** Clear storage, clear the in-memory token, `queryClient.clear()`.
  Local only, until `/auth/logout` exists.

`useAuth()` returns `{ status, user, signIn, signUp, signOut }` plus the
mutations' pending/error state. It throws a named error when called outside the
provider — a wiring mistake that should fail loudly, not read as "signed out".

### 5. Navigation

`src/navigation/` stops listing screens and starts listing modules:

```
src/navigation/
  RootNavigator.tsx   NavigationContainer + the gate
  RootStack.tsx       one Stack.Screen per module / shell
  constants.ts        ROOT_ROUTES = { AUTH, APP }
  types.ts            RootStackParamList with NavigatorScreenParams<…>
  index.ts
```

`RootNavigator` renders a splash while `status === 'loading'`, then `RootStack`.
`RootStack` renders **only one side**: the `AUTH` screen (`AuthStack`) when
signed out, the `APP` screen (`AppStack`) when signed in. Conditionally
rendering the screens — rather than registering both and calling `navigate` —
is what makes the Android back button unable to return to a signed-in screen
after sign-out; there is no history to go back to.

`AppStack` survives unchanged, still holding `HomeScreen`. It is the slot the
signed-in modules will be composed into.

Adding a screen to auth now touches only `src/modules/auth/navigation/`. Adding
a future module touches its own trio plus one line in each of the three root
files.

### 6. Errors and copy

Each screen owns a `COPY` object (Rule 4) and an `ERROR_COPY_BY_CODE` map from
`API_ERROR_CODES` to user-facing strings. Two rules:

- A `VALIDATION_ERROR`'s `details[]` is applied field by field through
  `react-hook-form`'s `setError`, so server validation lands in the same place
  as local validation.
- Any code with no entry in the map falls back to a generic message. A new code
  shipped by the API must never leave a screen silent.

`traceId` is not rendered; it is available on the `ApiError` for logging once
this repo has a logger.

### 7. Wiring in `App.tsx`

`QueryClientProvider` → `AuthProvider` → `RootNavigator`, inside the existing
`GestureHandlerRootView` / `SafeAreaProvider`. The `QueryClient` is created in
a module-level constant with the boilerplate's default options, not inline, so
it is not recreated on re-render.

### 8. Dependencies

| Package | Why |
| --- | --- |
| `@tanstack/react-query` | D1 |
| `react-hook-form` | D2 |
| `zod` | D2 — form schemas, response parsing, `env.ts` validation |
| `@hookform/resolvers` | D2 — bridges the two |
| `expo-secure-store` | token persistence; installed with `npx expo install` |

### 9. The refresh seam

> **Delivered on 2026-09-03** by
> [`2026-09-03-auth-refresh-logout-design.md`](2026-09-03-auth-refresh-logout-design.md).
> The seam held: no screen, no navigator and no other module changed, and the
> tie between the two layers is still `configureAuthorization`.
>
> One prediction below was wrong, and in the useful direction. Point 3 expected
> `storage.ts` to persist the refresh token **alongside** the access token; it
> replaced it instead, because the access token stopped being persisted at all
> and now lives in memory for the life of the process. Point 1 also moved: the
> retry lives in `src/lib/api.ts`, but the queue and the policy stayed in the
> module, since "which failures end a session" is module knowledge that layer
> may not hold.

When `POST /auth/refresh` and `POST /auth/logout` land in the API, the change
here is bounded to:

1. `AuthProvider`'s `onUnauthorized` — attempt a refresh before clearing the
   session; on success, retry the failed request.
2. `authApi.ts` — two new functions.
3. `storage.ts` — persist the refresh token alongside the access token.
4. `signOut` — call the endpoint before clearing local state.

No screen, no navigator, and no other module changes. That is the whole point
of D3, and this section is the acceptance criterion for it.

## Testing

Jest (`jest-expo`) + React Native Testing Library, colocated, with `fetch`
mocked directly. MSW is not introduced — a second HTTP layer to learn and
maintain for three endpoints.

| File | Proves |
| --- | --- |
| `src/config/env.test.ts` | a missing/blank `EXPO_PUBLIC_API_URL` throws a named error |
| `src/services/http/client.test.ts` | Bearer header attached; error envelope → `ApiError`; non-envelope body still → `ApiError`; `401` fires `onUnauthorized` |
| `src/modules/auth/api/schemas.test.ts` | the password schema accepts and rejects exactly what the API accepts and rejects (boundaries: 7/8/128/129 chars, each missing character class) |
| `src/modules/auth/api/authApi.test.ts` | each call hits the right path/method; responses parse; a drifted response shape throws |
| `src/modules/auth/AuthProvider.test.tsx` | boot with no token → `signedOut`; boot with a valid token → `signedIn`; boot with a rejected token → storage cleared, `signedOut`; sign-up chains register → login; sign-out clears storage and cache |
| `src/modules/auth/screens/SignInScreen.test.tsx` | an invalid email does not submit; a `401` renders the invalid-credentials copy; an unmapped code renders the fallback |

`expo-secure-store` is mocked in the Jest setup with an in-memory map.

Per `AGENTS.md` Rule 8, `render()` and `fireEvent.*()` are awaited.

## Documentation

Updated in the same changes that create the code, not afterwards:

- New `README.md` for `src/config/`, `src/services/http/`, and
  `src/modules/auth/` (Portuguese prose, English identifiers — Rule 3).
- `src/modules/README.md`: replace "_Nenhum ainda._" with the `auth` entry.
- `src/navigation/README.md`: the composition-root structure and the gate.
- `ARCHITECTURE.md`: §2 (tree), §6 (navigation — replace "Estado atual" with
  what the gate actually does), §10 (remove what now exists; keep refresh,
  logout, password reset as pending).
- `README.md`: check off the Auth roadmap item, noting refresh as deferred; add
  the `.env` setup step to "Começando".

## Delivery slices

1. Dependencies, `src/config/env.ts`, `.env.example`, `.gitignore`
2. `src/services/http/` + tests
3. `storage.ts` / `storage.web.ts` + Jest mock
4. `src/modules/auth/api/` (schemas + three calls) + tests
5. `AuthProvider`, `useAuth`, `App.tsx` wiring + tests
6. Navigation: the module trio, `RootStack`, the gate
7. `SignInScreen` / `SignUpScreen` + tests
8. Documentation pass

Each slice ends green on `pnpm check` and `pnpm test:ci`.

## Verification

Runnable in this environment: `pnpm check` (typecheck + lint) and
`pnpm test:ci` after every slice.

Not runnable here: WSL2 has no Xcode, Android SDK, or Maestro CLI, and the API
requires a running Postgres. End-to-end verification against a live
`api-clean-platform` — and any Maestro flow — happens outside this session, on
a machine with a dev client and the API up.

## Out of scope / explicitly deferred

- **Token refresh and server-side logout** — no endpoint (D3, §9).
- **Password reset, email verification, social login, biometrics** — no
  endpoints. `emailVerifiedAt` is carried in the `User` type because the API
  publishes it, and is otherwise unused.
- **A Maestro sign-in flow** — deferred; it needs a dev-client build and a
  reachable API, neither available in this environment.
- **i18n** — the `COPY` + `ERROR_COPY_BY_CODE` objects are the seam a library
  would replace later. No library is added.
- **A shared component library** — `src/components/` stays empty. The auth
  screens use plain RN primitives with NativeWind classes; a component moves
  out of the module only when a second module needs it (Rule 5).
- **CI** — this repo still has no workflow at all.
