# Email verification, password recovery and password change

**Date:** 2026-09-08
**Status:** Approved

## Goal

Bring this client back onto the API's contract and finish the auth module.

The API's auth module grew from six endpoints to eleven. Three flows it now
offers have no client at all — email verification, password recovery and
password change — and one flow this client already has, **sign-up, is broken**:
it calls an endpoint whose contract changed underneath it.

One slice covers all of it. The acceptance criterion is that every one of the
eleven `/auth` endpoints has a caller, or a written reason not to.

## What the API now offers

Read from `api-clean-platform` at commit `058705a`.

| Endpoint | Contract that matters here | Client today |
| --- | --- | --- |
| `POST /auth/register` | body `{ email }`, **`.strict()`** → `202`, no body. No account is created; a six-digit code is emailed. Answers `202` for a free address, a pending one and an address that already has an account | **broken** |
| `POST /auth/email/verify/resend` | body `{ email }` → `202`, no body. Re-mints the code for a *pending registration*. 60-second cooldown per account | missing |
| `POST /auth/email/verify` | body `{ email, code, password, refreshTransport }` → `200 { accessToken, refreshToken? }`. **The account is created here**, verified, with the password sent in this request, and a session opens | missing |
| `POST /auth/login` | unchanged. Adds `403 EMAIL_NOT_VERIFIED` | present |
| `POST /auth/refresh` | unchanged | present |
| `POST /auth/password` | Bearer; body `{ currentPassword, newPassword, refreshTransport }` → `200 { accessToken, refreshToken? }`. Revokes every other session; this device gets a fresh pair | missing |
| `POST /auth/password/forgot` | body `{ email }`, **`.strict()`** → `202`, no body. Emails a reset token if the address has an account; nothing at all if it does not. 60-second cooldown | missing |
| `POST /auth/password/reset` | body `{ token, newPassword }`, **`.strict()`** → `204`, **no session**. Revokes every session of the account | missing |
| `POST /auth/logout` | unchanged | present |
| `POST /auth/logout-all` | unchanged | present |
| `GET /auth/me` | unchanged | present |

New error codes reaching the wire:

| Code | Status | From |
| --- | --- | --- |
| `EMAIL_VERIFICATION_FAILED` | 422 | `/email/verify` — one answer for unknown, wrong, expired and attempt-exhausted codes |
| `EMAIL_NOT_VERIFIED` | 403 | `/login` — the password was right, the account is not verified |
| `PASSWORD_RESET_FAILED` | 422 | `/password/reset` — one answer for unknown, wrong, expired and already-used tokens |
| `INVALID_CURRENT_PASSWORD` | 422 | `/password` |
| `PASSWORD_UNCHANGED` | 422 | `/password` — the new password equals the current one |
| `TOO_MANY_REQUESTS` | 429 | every sensitive route, each with its own per-IP ceiling |

Policy values to mirror: the verification code is **6 digits**, lives **15
minutes**, and dies after **5 wrong guesses**. The reset token is **base64url,
32–64 characters** (43 in practice), lives **30 minutes**, and is single-use.
Both resend paths carry a **60-second** cooldown. The password policy
(8–128 characters, letter + digit + non-alphanumeric) is unchanged.

The reset token arrives in the user's inbox as **plain text**, not as a link —
there is nothing for a deep link to open.

## What is broken today

[`authApi.ts`](../../../src/modules/auth/api/authApi.ts) posts
`{ email, password }` to `/auth/register` and parses `201 { id }`. The API's body
schema is now `.strict()` and accepts `email` only, so **every sign-up answers
`400`**. Even if the field were dropped, the flow would still be wrong: the
account no longer exists after `register`, so the `register → login` chain in
`AuthProvider` cannot open a session. `registerResponseSchema` describes a
response the API no longer sends.

The API moved the password to step 3 deliberately: the code reaches only the
owner of the address, so whoever completes the confirmation is whoever chooses
the password. That closes *account pre-hijacking*, and this client has to adopt
the shape, not work around it.

## Scope

**In.** The three missing flows and the broken one; the six new error codes; a
signed-in account area holding the password change and the two sign-outs; the
`AuthProvider` split that keeps those files readable; tests and READMEs for all
of it.

**Out.** Everything in *Out of scope* at the end.

## Decisions

### D1 — Only session-owning calls go through `AuthContext`

`startSignUp`, `resendVerificationCode`, `requestPasswordReset` and
`resetPassword` write no token, read no token and change no `status`. They are
plain HTTP calls that happen to live in this module. Their screens call
`authApi` through their own `useMutation` and render their own `isPending`.

`signIn`, `confirmSignUp`, `changePassword`, `signOut` and `signOutEverywhere`
do own the session, and stay on the context.

The alternative — putting all nine on the context — costs a provider twice the
size and makes `isSubmitting` mean four unrelated things at once, in exchange
for nothing: no screen needs a sessionless call to be shared.

### D2 — `AuthProvider` splits into two hooks

`AuthContext.tsx` is already ~250 lines. Adding `confirmSignUp` and
`changePassword` pushes it past the point where the boot sequence, the
single-flight refresh and the mutation cluster can be read separately.

- `hooks/useAuthSession.ts` — token state and ref, boot, `refreshAccessToken`,
  `meQuery`, `endSession`, and the two session primitives below.
- `hooks/useAuthActions.ts` — the five mutations, taking those primitives.
- `context/AuthContext.tsx` — composes the two and builds the context value.

The two primitives, split because they are not the same operation:

- **`adoptTokens(tokens)`** — persist the refresh token, then apply the access
  token. The refresh path already does exactly this, so it stops open-coding it.
- **`openSession(tokens)`** — `adoptTokens`, then `fetchQuery` the profile, so
  the user is in the cache before the promise resolves and the navigator swaps
  in the same tick the screen stops submitting.

`signIn` and `confirmSignUp` need `openSession`. `changePassword` needs only
`adoptTokens`: the profile is already cached and unchanged, and the reason to
write at all is that the API just revoked the refresh token on disk.

### D3 — The signed-in account area is a nested navigator the module exports

`RootStack` states the rule already: one `Stack.Screen` per module, never per
screen. So `src/modules/auth/navigation/AccountStack.tsx` holds `Account` and
`ChangePassword`, the module's `index.ts` exports it with its param list, and
`AppStack` registers it as a single screen whose params are
`NavigatorScreenParams<AccountStackParamList>` — the same shape
`RootStackParamList` already uses.

Registering the two screens directly on `AppStack` would be less code and would
make `src/navigation/` import two files from inside the auth module, which is
exactly the boundary rule 5 of `AGENTS.md` forbids.

### D4 — `SignUp` collects the email only

The password is chosen on `VerifyEmail`, where the API requires it. Collecting
it on `SignUp` and carrying it forward would mean a plaintext password sitting
in React Navigation's route params — serialized into navigation state, and into
state persistence the day anyone enables it — for as long as the user takes to
find the code. The flow reads as the API models it, and nothing sensitive
crosses a screen boundary.

### D5 — `VerifyEmail` is reachable without a pending screen, and its email field is editable

The code is already in the inbox when the app is killed between `register` and
confirmation. `SignIn` gets an "I already have a code" link straight to
`VerifyEmail`, with no param.

Nothing is persisted. A pending registration lives 15 minutes on the server;
mirroring that on disk means a second expiry to keep in step with the API's, and
a boot path that can open on a screen for a registration that already died.

The email field is rendered and editable in both entries, pre-filled from the
route param when it is there. A typo means the code went to someone else's
inbox, and a read-only field would leave the user with no way back but to
restart the flow.

### D6 — Recovery is two screens, with the email as a route param

`ForgotPassword` takes the address and always advances; `ResetPassword` takes
the pasted token and the new password and, on `204`, returns to `SignIn` with
the email pre-filled. One screen with two modes would put a "send" button and a
"submit" button on the same form and make the disabled states carry the flow.

### D7 — `EMAIL_ALREADY_IN_USE` is deleted from the client

Verified in the API: `confirm-email.ts` catches `EmailAlreadyInUseError` from
the unique-index race and rethrows it as `EmailVerificationFailedError`, and no
other call site lets it reach the wire. `register` cannot produce it either — it
answers `202` to every address by design.

So the code, its entry in `API_ERROR_CODES` and its copy all go. Keeping copy
for a code the API cannot send documents a contract that does not exist, and the
next reader would trust it.

### D8 — `EMAIL_NOT_VERIFIED` gets copy, and does **not** navigate

The tempting handling — send the user to `VerifyEmail` with the email they
typed — is a dead end. An account that exists but is unverified has **no**
pending registration: that row is consumed when the account is created. `resend`
would find nothing and answer `202` anyway, and `confirm` could never succeed.

So the sign-in screen renders the copy and stays put. In practice this branch is
unreachable today — every account is born verified — and the API keeps the gate
for social login. The client matches that posture: handled, not featured.

### D9 — `TOO_MANY_REQUESTS` gets copy, not a new `ErrorKind`

A 429 already classifies as `INPUT` through the status check, and `INPUT` is not
retryable — which is the correct behaviour, since retrying a rate limit is what
produced it. The only real gap is that `copyForError` has no entry, so a
throttled user reads "Something went wrong."

It goes in `BASE_COPY`, not in the auth module's map: every module that ever
calls the API can receive it.

`Retry-After` is deliberately not read. Rendering a countdown from it means a
clock, a re-render loop and a second source of truth beside the resend cooldown,
for a header the user cannot act on differently than "try again in a moment."

### D10 — `validations.ts` becomes a folder of four files

Six forms cannot share one file and stay readable. `validations/` splits by
purpose, not by form:

- `policy.ts` — the constants mirrored from the API, `VALIDATION_COPY`, and the
  `emailSchema` / `passwordSchema` every other file builds on.
- `credentials.ts` — `signInSchema`, and `signUpSchema` (now email only).
- `verification.ts` — `confirmSignUpSchema`.
- `password.ts` — `forgotPasswordSchema`, `resetPasswordSchema`,
  `changePasswordSchema`.

Two constants join the four already mirrored: `VERIFICATION_CODE_DIGITS = 6` and
`RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/`. Both are shape, never a
judgement about whether the value is real — that is the API's single generic
error to give.

### D11 — "Confirm password" is a client-only field

Three forms take a new password, and each one is the only chance to catch a
typo before the password becomes the account's. The confirmation lives in the
zod schema as a `.refine`, and the field never leaves the client — the API's
bodies have no place to put it, and `reset` and `forgot` are `.strict()`.

### D12 — The resend countdown starts on arrival from `SignUp`, and never branches on the answer

`VerifyEmail` reached with an `email` param was reached because `SignUp` just
sent a code, so the 60-second countdown starts on mount. Reached from the
"I already have a code" link, no send happened here and resend is available at
once.

The countdown restarts when the button is pressed, whatever the API did — a
resend inside the server's own cooldown answers `202` and sends nothing, and it
is indistinguishable from a resend that worked. That indistinguishability is the
point, and the UI must not leak past it.

### D13 — `Account` renders the email and the actions, and no dates

`/auth/me` also returns `createdAt` and `emailVerifiedAt`. Rendering either
means a date formatter, a locale decision and a `Date` whose only consumer is
its own formatting. The schema's existing note — dates stay ISO strings because
nothing formats one yet — stays true after this slice.

## Design

### 1. `src/lib/api.ts`

`API_ERROR_CODES` loses `EMAIL_ALREADY_IN_USE` (D7) and gains six:
`TOO_MANY_REQUESTS`, `EMAIL_NOT_VERIFIED`, `EMAIL_VERIFICATION_FAILED`,
`PASSWORD_RESET_FAILED`, `INVALID_CURRENT_PASSWORD`, `PASSWORD_UNCHANGED`.

Nothing else in this file changes. `send()` already maps `204` to `null`; a
`202` with a null body arrives as `null` from axios and is discarded by callers
that return `void`.

### 2. `src/errors/`

`copy.ts` — `BASE_COPY` gains `TOO_MANY_REQUESTS` (D9). `classify.ts` is
untouched (D9).

### 3. `src/modules/auth/api/`

`schemas.ts` — `registerResponseSchema` is deleted. `sessionTokensSchema` and
`userSchema` are unchanged.

`authApi.ts` — `register` is deleted; six functions arrive. The four that answer
`202`/`204` parse nothing and return `void`; parsing a body the API does not
send would invent a contract.

| Function | Call |
| --- | --- |
| `startSignUp(email)` | `POST /auth/register` `{ email }` |
| `resendVerificationCode(email)` | `POST /auth/email/verify/resend` `{ email }` |
| `confirmSignUp({ email, code, password })` | `POST /auth/email/verify`, `refreshTransport: 'body'` → `SessionTokens` |
| `requestPasswordReset(email)` | `POST /auth/password/forgot` `{ email }` |
| `resetPassword({ token, newPassword })` | `POST /auth/password/reset` |
| `changePassword({ currentPassword, newPassword })` | `POST /auth/password`, `refreshTransport: 'body'` → `SessionTokens` |

`REFRESH_TRANSPORT_BODY` stays stated explicitly on all three session-issuing
calls, for the reason D6 of the previous spec gives: the server's default is
the server's to change.

### 4. `src/modules/auth/validations/`

Four files as in D10. `signUpSchema` becomes `z.object({ email: emailSchema })`
and its inferred type is used by `SignUpScreen`; `Credentials` still comes from
`signInSchema`.

`confirmSignUpSchema`: `email`, `code` (exactly `VERIFICATION_CODE_DIGITS`
digits), `password` (full policy), `confirmPassword` (D11).
`forgotPasswordSchema`: `email`.
`resetPasswordSchema`: `token` (`RESET_TOKEN_PATTERN`), `newPassword`,
`confirmPassword`.
`changePasswordSchema`: `currentPassword` (presence only — the same reasoning
`signInSchema` already carries), `newPassword`, `confirmPassword`.

`validations/index.ts` re-exports all of them plus their inferred types.

### 5. `src/modules/auth/components/FormTextField.tsx`

`FIELD_TYPES` gains three entries, because keyboard behaviour belongs to the
kind of field and not to the call site — the rule the file already states:

- `CODE` — `keyboardType: 'number-pad'`, `autoComplete: 'one-time-code'`,
  `secureTextEntry: false`, `maxLength` from `VERIFICATION_CODE_DIGITS`.
- `NEW_PASSWORD` — as `PASSWORD`, with `autoComplete: 'new-password'`, so the
  platform password manager offers to generate and store rather than to fill.

- `TOKEN` — `autoCapitalize: 'none'`, `autoComplete: 'off'`,
  `autoCorrect: false`, `secureTextEntry: false`. A pasted base64url string has
  to survive autocapitalisation and autocorrect, both of which are on by
  default and both of which would silently produce an invalid token.

### 6. `src/modules/auth/errorCopy.ts`

`AUTH_ERROR_COPY` drops `EMAIL_ALREADY_IN_USE` (D7) and gains
`EMAIL_VERIFICATION_FAILED`, `EMAIL_NOT_VERIFIED`, `PASSWORD_RESET_FAILED`,
`INVALID_CURRENT_PASSWORD`, `PASSWORD_UNCHANGED`, plus `USER_NOT_FOUND`,
`INVALID_EMAIL` and `INVALID_PASSWORD` — three codes that were already in
`API_ERROR_CODES` with no copy and can now surface from confirm, reset and
change.

`applyServerFieldErrors` becomes generic over `FieldValues` and takes the field
names the calling form recognises:

```ts
applyServerFieldErrors<TValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TValues>,
  fields: readonly Path<TValues>[],
): void
```

The allowlist stays because the API's `details[].field` is a server-side name:
without it, a field the form does not render would set an error nothing can
display, and the user would see a form that refuses to submit for no visible
reason.

### 7. `src/modules/auth/hooks/useAuthSession.ts`

Everything `AuthProvider` does today except the mutations: `token` state and
ref, `applyToken`, `meQuery`, `endSession`, the single-flight
`refreshAccessToken`, the `configureAuthorization` effect, the boot effect, the
boot-completion effect, and the effect that clears a token the API rejected.

Returns `{ status, user, adoptTokens, openSession, endSession }`. `adoptTokens`
and `openSession` are D2; `refreshAccessToken` now calls `adoptTokens` instead
of writing and applying inline.

### 8. `src/modules/auth/hooks/useAuthActions.ts`

Takes `{ adoptTokens, openSession, endSession }` and owns five mutations, all
with `networkMode: 'always'` for the reason already documented:

- `signIn(credentials)` — `login` → `openSession`.
- `confirmSignUp(values)` — `confirmSignUp` → `openSession`. The `RootStack`
  swap unmounts `VerifyEmail` on success; nothing navigates by hand.
- `changePassword(values)` — `changePassword` → `adoptTokens`. The session
  survives. Rejects on failure so the screen can put
  `INVALID_CURRENT_PASSWORD` on the `currentPassword` field and
  `PASSWORD_UNCHANGED` on `newPassword`.
- `signOut` / `signOutEverywhere` — unchanged, including the asymmetry: the
  first swallows the server call's failure, the second does not.

Returns the five, plus `isSubmitting` (`signIn` ∨ `confirmSignUp` ∨
`changePassword`) and `isSigningOut` (the two sign-outs).

### 9. `src/modules/auth/context/AuthContext.tsx`

Reduced to the provider: calls both hooks, memoises the value, renders the
provider. The context object itself stays here.

### 10. `types.ts` and `index.ts`

`AuthContextValue` drops `signUp` and gains `confirmSignUp` and
`changePassword`. `index.ts` additionally exports `AccountStack` and
`AccountStackParamList` (D3).

### 11. Navigation

`modules/auth/navigation/types.ts`:

```ts
export type AuthStackParamList = {
  SignIn: { email?: string } | undefined;
  SignUp: undefined;
  VerifyEmail: { email?: string } | undefined;
  ForgotPassword: undefined;
  ResetPassword: { email: string };
};

export type AccountStackParamList = {
  Account: undefined;
  ChangePassword: undefined;
};
```

`AuthStack` registers the three new screens. `AccountStack` is a new navigator
with the two account screens and a visible header, since it is a pushed flow
inside the signed-in shell.

`src/navigation/types.ts`: `AppStackParamList` gains
`Account: NavigatorScreenParams<AccountStackParamList>`. `src/navigation/AppStack.tsx`
registers it with `headerShown: false`, so the inner stack owns its own header
rather than nesting two.

### 12. Screens

**`SignUpScreen`** — email only. On success, `navigate('VerifyEmail', { email })`.
It advances identically for a free address, a pending one and one that already
has an account: the API answers `202` to all three, and a client branch here
would rebuild the account enumeration the API removed.

**`VerifyEmailScreen`** (new) — email (editable, pre-filled from the param),
code, password, confirm password; a resend control with the 60-second countdown
of D12; submit calls `confirmSignUp`. `RESEND_COOLDOWN_SECONDS` stays in this
file rather than in the module's `constants.ts`: rule 4 promotes a constant only
once a second file needs it, and only this screen resends. `EMAIL_VERIFICATION_FAILED` renders as one
message covering every failure mode, because that is all the API distinguishes.

**`ForgotPasswordScreen`** (new) — email; always advances to
`ResetPassword` with the address (D6). No branch on the answer.

**`ResetPasswordScreen`** (new) — token, new password, confirm. On `204`,
`navigate('SignIn', { email })`. `PASSWORD_RESET_FAILED` is one message.

The `email` param is carried but never sent: `POST /auth/password/reset` takes
`{ token, newPassword }` and is `.strict()`. It exists only so the sign-in form
the user lands on is already filled in — the reset revoked every session, so
signing in again is not optional.

**`AccountScreen`** (new) — the email from `useAuth().user`, a link to
`ChangePassword`, and the two sign-out actions moved verbatim from `HomeScreen`,
`Alert` confirmation included. No dates (D13).

**`ChangePasswordScreen`** (new) — current password, new password, confirm. On
success the user stays signed in; the screen pops back to `Account` and reports
that other devices were signed out, which is what the API actually did.

**`SignInScreen`** — two links added: "Forgot your password?" and "I already
have a code". `defaultValues.email` reads `route.params?.email ?? ''`.

**`HomeScreen`** — loses the two sign-out buttons, gains a link to `Account`.

## Testing

Colocated, as rule 8 of `AGENTS.md` requires; `await` on every `render` and
`fireEvent`.

- **Plain Jest** — the four `validations/` files (each schema's accept and
  reject cases, including the `.refine` mismatch); `errorCopy.ts` for the
  generic `applyServerFieldErrors` and its allowlist; `authApi.test.ts` extended
  with the six functions, asserting the exact body each sends — the `.strict()`
  bodies make an extra field a `400`, so the assertion is the contract.
- **RNTL** — the five new screens, plus the changed `SignIn`, `SignUp` and
  `Home`. Each screen registers `AUTH_ERROR_COPY` in `beforeEach`, as the
  existing screen tests already do.
- **`AuthContext.test.tsx`** — `confirmSignUp` opens a session; `changePassword`
  persists the new refresh token and keeps the session; the removal of `signUp`.
  The two new hooks are exercised through the provider, since neither is a
  public export and their contract is what the provider hands out.

Two behaviours deserve an explicit test each, because they are the ones a
refactor would silently break: `SignUp` and `ForgotPassword` advance on success
**without** reading the response, and the resend countdown restarts on press
regardless of the answer.

## Documentation

Same commit as the code they describe.

- `src/modules/auth/README.md` — the largest edit. The Conventions section
  currently describes a sign-up flow that no longer exists ("Cadastro faz login
  em seguida", `201 { id }`). It documents the three-step sign-up, the
  session-owning boundary of D1, the two hooks of D2, the account stack of D3,
  and the two `202`-always screens that must never branch.
- `src/navigation/README.md` — the nested `Account` route.
- `src/lib/README.md` — the error-code changes.
- `src/errors/README.md` — `TOO_MANY_REQUESTS` in the base copy.
- `src/screens/README.md` — `HomeScreen`'s reduced role.

## Delivery slices

Commit order, so each commit type-checks and its tests pass on their own:

1. **Contract.** `src/lib/api.ts` codes, `src/errors/copy.ts`, `api/schemas.ts`,
   `api/authApi.ts` + tests.
2. **Validation.** The `validations/` split, the new schemas,
   `FormTextField`'s new field types, generic `applyServerFieldErrors` + tests.
3. **State.** `useAuthSession`, `useAuthActions`, the slimmed `AuthContext`,
   `types.ts`, `index.ts` + tests.
4. **Navigation.** `AuthStackParamList`, `AccountStack`, `AppStack`,
   `src/navigation/types.ts`.
5. **Screens.** `VerifyEmail`, `ForgotPassword`, `ResetPassword`, `Account`,
   `ChangePassword`, and the edits to `SignIn`, `SignUp`, `Home` + tests.
6. **Documentation.** Every file listed above.

## Verification

Runnable here: `pnpm check` and `pnpm test:ci` after every slice.

Not runnable here: WSL2 has no Xcode, Android SDK or Maestro CLI, and the API
needs Postgres and a mail sink. Every flow is exercised against fakes in Jest;
end-to-end verification against a live `api-clean-platform` happens outside this
session.

Four things a fake cannot prove, worth checking by hand there:

1. `register` with an address that already has an account still lands the user
   on `VerifyEmail` — and the inbox receives the "someone tried to register"
   notice rather than a code.
2. A code entered after five wrong guesses fails with the same message as a
   typo, with no timing or wording difference.
3. `changePassword` on device A signs device B out within the access token's
   TTL, not instantly — the API keeps the database off the authenticated path.
4. `reset` revokes the session on the device that ran it too: the app must land
   on `SignIn`, not on a signed-in screen with a dead token.

## Out of scope / explicitly deferred

- **Social login / OAuth (Google)** — the API lists it as a future slice; no
  endpoint exists.
- **Account deletion** — same.
- **Deep links for the reset token** — the API emails plain text (D6). Revisit
  if and when the email carries a URL.
- **Reading `Retry-After` on a 429** — D9.
- **Persisting a pending registration across launches** — D5.
- **Rendering `createdAt` / `emailVerifiedAt`, and any date formatting** — D13.
- **Cookie transport on the web target** — unchanged from the previous spec.
- **Session listing or per-device revocation** — the API exposes no endpoint to
  enumerate sessions.
- **Maestro flows** — still needs a dev-client build and a reachable API.
