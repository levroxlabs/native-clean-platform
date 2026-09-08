# Email verification, password recovery and password change — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every one of the API's eleven `/auth` endpoints a caller — fixing the sign-up flow, which is broken today, and adding email verification, password recovery and password change.

**Architecture:** The account is created at confirmation, not at registration, so sign-up becomes three steps: `register` (email only) → a six-digit code by email → `email/verify` (code + chosen password), which is what opens the session. Calls that own the session stay on `AuthContext`; calls that touch no token are plain mutations in their screens. `AuthProvider` splits into a session hook and an actions hook, and the signed-in shell gains an account area the auth module exports as its own navigator.

**Tech Stack:** TypeScript, React Native 0.86 / Expo 57, axios, TanStack Query 5, zod 4, react-hook-form 7, React Navigation 7, `expo-secure-store`, NativeWind 4, jest-expo + React Native Testing Library, Biome.

**Spec:** [`docs/superpowers/specs/2026-09-08-auth-verification-recovery-design.md`](../specs/2026-09-08-auth-verification-recovery-design.md) — read it before Task 1; every decision reference below (D1–D13) points into it.

## Global Constraints

- **English only** in code, comments, identifiers, file names and commit messages. `README.md` prose is the one exception: Portuguese prose, English identifiers and folder names.
- **Arrow functions assigned to a `const`.** No `function` declarations or expressions, components included.
- **No magic strings or numbers.** Named constants in `UPPER_SNAKE_CASE` carrying their unit; closed sets are a `const` object with `as const` plus a derived union type, never a TS `enum`. Route names and API paths stay inline — each is declared exactly once.
- **User-facing copy lives in a `COPY` object** colocated with its screen or component. The API's `message` never reaches the screen; copy is chosen from the `code`.
- **Styling is NativeWind classes only**, preferring semantic aliases (`bg-background`, `text-content`, `text-content-muted`, `text-danger`, `bg-danger-surface`, `text-primary`) over raw scales. No `StyleSheet.create`, no inline style objects.
- **Imports use the `@/` alias**, never `../../`. Nothing outside a module imports a file inside it — only what `src/modules/<m>/index.ts` exports. `src/lib/**` imports no module and no React; `src/errors/**` may import `src/lib/` but never a module. A module importing `@/errors` is allowed and is used throughout this plan.
- **Tests are colocated** next to the file they test, with the `.test.ts`/`.test.tsx` suffix — that exact suffix is what Biome's `noMagicNumbers` override matches, so any other name silently fails `pnpm lint`. Never `__tests__/`, never snapshots.
- **`render()` and `fireEvent.*()` are awaited.** In the installed version they return Promises, and omitting `await` fails confusingly later in the test rather than at the call site.
- **`pnpm check` (typecheck + lint) and `pnpm test:ci` are green before every commit.**
- **A module's `README.md` is updated in the same change** that adds, removes or renames one of its exports. Task 11 collects the prose that describes behaviour rather than exports.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

### Values mirrored from the API — copy them exactly

| Value | Constant | Where |
| --- | --- | --- |
| 254 | `MAX_EMAIL_LENGTH` | already in `validations/` |
| 8 / 128 | `MIN_PASSWORD_LENGTH` / `MAX_PASSWORD_LENGTH` | already in `validations/` |
| `/^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/s` | `PASSWORD_POLICY_PATTERN` | already in `validations/` |
| 6 | `VERIFICATION_CODE_DIGITS` | Task 3 |
| `/^[A-Za-z0-9_-]{32,64}$/` | `RESET_TOKEN_PATTERN` | Task 3 |
| 60 seconds | `RESEND_COOLDOWN_SECONDS` | Task 8, in `hooks/useResendCooldown.ts` — the spec placed it in the screen, before the countdown was extracted into a hook of its own |

---

### Task 1: The error codes the API can actually send

Two changes to the client's picture of the API's error contract, both from the spec: six codes arrive (D-table in the spec's *What the API now offers*), and `EMAIL_ALREADY_IN_USE` leaves (D7).

`EMAIL_ALREADY_IN_USE` is not deprecated — it is unreachable. `confirm-email.ts` in the API catches `EmailAlreadyInUseError` from the unique-index race and rethrows it as `EmailVerificationFailedError`, and `register` answers `202` to every address by design. Two existing tests assert against it and both change here: one in `classify.test.ts` only needs a different 4xx code to make the same point, and one in `SignUpScreen.test.tsx` asserts a behaviour the API can no longer produce and is deleted.

`TOO_MANY_REQUESTS` goes in `BASE_COPY` and not in the auth module's map (D9): every module that calls the API can receive a 429. `classify.ts` is deliberately untouched — a 429 already lands in `INPUT` through the status check, and `INPUT` is not retryable, which is right.

**Files:**
- Modify: `src/lib/api.ts:26-50` (the `API_ERROR_CODES` object)
- Modify: `src/errors/copy.ts:10-18` (the `BASE_COPY` object)
- Modify: `src/modules/auth/errorCopy.ts:19-24` (remove one entry)
- Test: `src/errors/copy.test.ts`, `src/errors/classify.test.ts`, `src/modules/auth/screens/SignUpScreen.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `API_ERROR_CODES.TOO_MANY_REQUESTS`, `.EMAIL_NOT_VERIFIED`, `.EMAIL_VERIFICATION_FAILED`, `.PASSWORD_RESET_FAILED`, `.INVALID_CURRENT_PASSWORD`, `.PASSWORD_UNCHANGED` — Tasks 5, 7, 8, 9 and 10 all branch on these. `API_ERROR_CODES.EMAIL_ALREADY_IN_USE` no longer exists.

- [ ] **Step 1: Write the failing tests**

In `src/errors/copy.test.ts`, add inside `describe('copyForError')`:

```ts
  it('phrases a rate limit as something to try again shortly', () => {
    expect(copyForError(apiError(API_ERROR_CODES.TOO_MANY_REQUESTS))).toBe(
      'Too many attempts. Please wait a moment and try again.',
    );
  });
```

In `src/errors/classify.test.ts`, replace the `'calls a conflict input'` test (line 38–42) with these two:

```ts
  it('calls a rejected current password input', () => {
    expect(classifyError(apiError(422, API_ERROR_CODES.INVALID_CURRENT_PASSWORD))).toBe(
      ERROR_KINDS.INPUT,
    );
  });

  it('calls a rate limit input, so nothing retries it automatically', () => {
    // Retrying a 429 is what produced it. `INPUT` is the only kind that is
    // neither retried nor treated as a dead session, which is exactly right.
    expect(classifyError(apiError(429, API_ERROR_CODES.TOO_MANY_REQUESTS))).toBe(
      ERROR_KINDS.INPUT,
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:ci -- src/errors`
Expected: FAIL — `copyForError` falls back to "Something went wrong. Please try again.", and `API_ERROR_CODES.TOO_MANY_REQUESTS` / `.INVALID_CURRENT_PASSWORD` do not typecheck.

- [ ] **Step 3: Add the six codes and remove the unreachable one**

In `src/lib/api.ts`, inside `API_ERROR_CODES`: delete the `EMAIL_ALREADY_IN_USE` line and add these, each with the comment that says where it comes from:

```ts
  /** The API rejected the request for exceeding a per-IP ceiling. Arrives as a 429. */
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  /** 403 on login: the password was right, the account is not verified. */
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  /**
   * 422 from `/auth/email/verify`. One code for every failure mode — unknown,
   * wrong, expired, attempts exhausted — so the client cannot build an oracle
   * the API deliberately refused to give it.
   */
  EMAIL_VERIFICATION_FAILED: 'EMAIL_VERIFICATION_FAILED',
  /** 422 from `/auth/password/reset`. One code for every token failure, as above. */
  PASSWORD_RESET_FAILED: 'PASSWORD_RESET_FAILED',
  /** 422 from `/auth/password`: the current password did not match. */
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
  /** 422 from `/auth/password`: the new password equals the current one. */
  PASSWORD_UNCHANGED: 'PASSWORD_UNCHANGED',
```

- [ ] **Step 4: Add the base copy**

In `src/errors/copy.ts`, inside `BASE_COPY`:

```ts
  [API_ERROR_CODES.TOO_MANY_REQUESTS]: 'Too many attempts. Please wait a moment and try again.',
```

- [ ] **Step 5: Drop the copy for the code that cannot arrive**

In `src/modules/auth/errorCopy.ts`, delete the `EMAIL_ALREADY_IN_USE` line from `AUTH_ERROR_COPY`.

- [ ] **Step 6: Delete the SignUpScreen test that asserted it**

In `src/modules/auth/screens/SignUpScreen.test.tsx`, delete the whole `it('shows the conflict copy when the email is taken', ...)` block. The API cannot answer that way any more; the test would be asserting a fiction. Leave the rest of the file alone — Task 8 rewrites it.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test:ci` and `pnpm check`
Expected: PASS, both.

- [ ] **Step 8: Commit**

```bash
git add src/lib/api.ts src/errors/copy.ts src/errors/copy.test.ts src/errors/classify.test.ts src/modules/auth/errorCopy.ts src/modules/auth/screens/SignUpScreen.test.tsx
git commit -m "$(cat <<'MSG'
feat: teach the client the API's current error codes

Seis códigos novos chegam ao fio — 429, o gate de e-mail não verificado,
e os quatro de verificação, reset e troca de senha.

EMAIL_ALREADY_IN_USE sai: o confirm-email da API captura esse erro da
corrida no índice único e o converte em EMAIL_VERIFICATION_FAILED, e o
register responde 202 para qualquer endereço. Nenhum endpoint consegue
mais enviá-lo, então a copy documentava um contrato inexistente.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: The six new API calls

Purely additive: `register` and `registerResponseSchema` stay until Task 8 removes their last caller.

Four of the six answer `202` or `204` with no body and return `void`. They parse nothing — `parseOrThrow` against a body the API does not send would invent a contract. Two answer `200` with a token pair and reuse `sessionTokensSchema`.

`refreshTransport: 'body'` is stated explicitly on all three session-issuing calls, for the reason the previous spec's D6 gives: the server's default is the server's to change, and this client depends on the refresh token being in the body.

**Files:**
- Modify: `src/modules/auth/api/authApi.ts`
- Test: `src/modules/auth/api/authApi.test.ts`

**Interfaces:**
- Consumes: `api`, `ApiError`, `API_ERROR_CODES`, `CLIENT_FAILURE_STATUS` from `@/lib`; `sessionTokensSchema`, `SessionTokens` from `./schemas`; the existing `parseOrThrow` helper in this file.
- Produces, all exported from `src/modules/auth/api/authApi.ts`:
  - `startSignUp(email: string): Promise<void>`
  - `resendVerificationCode(email: string): Promise<void>`
  - `confirmSignUp(input: { email: string; code: string; password: string }): Promise<SessionTokens>`
  - `requestPasswordReset(email: string): Promise<void>`
  - `resetPassword(input: { token: string; newPassword: string }): Promise<void>`
  - `changePassword(input: { currentPassword: string; newPassword: string }): Promise<SessionTokens>`

  Tasks 7–10 call these.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/auth/api/authApi.test.ts`. Add the constants near the ones already at the top of the file:

```ts
const VERIFICATION_CODE = '042317';
const RESET_TOKEN = 'Yk9wYVF1ZVRva2VuRXhhbXBsZVZhbHVlMTIzNDU2Nzg5';
const NEW_PASSWORD = 'ev3nS4fer!';
```

and these blocks at the end:

```ts
describe('startSignUp', () => {
  it('sends the email alone, because the API body is strict', async () => {
    mockApi.post.mockResolvedValue(null);

    await expect(startSignUp(CREDENTIALS.email)).resolves.toBeUndefined();
    // A stale `password` here is a 400, not a silently dropped field: the API
    // schema is `.strict()`. The assertion is the contract.
    expect(mockApi.post).toHaveBeenCalledWith('/auth/register', { email: CREDENTIALS.email });
  });
});

describe('resendVerificationCode', () => {
  it('sends the email and parses nothing, since 202 has no body', async () => {
    mockApi.post.mockResolvedValue(null);

    await expect(resendVerificationCode(CREDENTIALS.email)).resolves.toBeUndefined();
    expect(mockApi.post).toHaveBeenCalledWith('/auth/email/verify/resend', {
      email: CREDENTIALS.email,
    });
  });
});

describe('confirmSignUp', () => {
  const input = {
    email: CREDENTIALS.email,
    code: VERIFICATION_CODE,
    password: CREDENTIALS.password,
  };

  it('asks for body transport and returns both tokens', async () => {
    mockApi.post.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
    });

    await expect(confirmSignUp(input)).resolves.toEqual({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
    });
    expect(mockApi.post).toHaveBeenCalledWith('/auth/email/verify', {
      ...input,
      refreshTransport: 'body',
    });
  });

  it('rejects an answer with no refresh token as a contract drift', async () => {
    mockApi.post.mockResolvedValue({ accessToken: ACCESS_TOKEN });

    await expect(confirmSignUp(input)).rejects.toMatchObject({
      code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
    });
  });
});

describe('requestPasswordReset', () => {
  it('sends the email alone, because the API body is strict', async () => {
    mockApi.post.mockResolvedValue(null);

    await expect(requestPasswordReset(CREDENTIALS.email)).resolves.toBeUndefined();
    expect(mockApi.post).toHaveBeenCalledWith('/auth/password/forgot', {
      email: CREDENTIALS.email,
    });
  });
});

describe('resetPassword', () => {
  it('sends the token and the new password, and nothing else', async () => {
    mockApi.post.mockResolvedValue(null);

    await expect(
      resetPassword({ token: RESET_TOKEN, newPassword: NEW_PASSWORD }),
    ).resolves.toBeUndefined();
    // No email: the API body is `{ token, newPassword }` and `.strict()`.
    expect(mockApi.post).toHaveBeenCalledWith('/auth/password/reset', {
      token: RESET_TOKEN,
      newPassword: NEW_PASSWORD,
    });
  });
});

describe('changePassword', () => {
  it('asks for body transport and returns the replacement pair', async () => {
    mockApi.post.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: ROTATED_REFRESH_TOKEN,
    });

    await expect(
      changePassword({ currentPassword: CREDENTIALS.password, newPassword: NEW_PASSWORD }),
    ).resolves.toEqual({ accessToken: ACCESS_TOKEN, refreshToken: ROTATED_REFRESH_TOKEN });
    expect(mockApi.post).toHaveBeenCalledWith('/auth/password', {
      currentPassword: CREDENTIALS.password,
      newPassword: NEW_PASSWORD,
      refreshTransport: 'body',
    });
  });
});
```

Extend the import at the top of the file to include the six new names.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:ci -- src/modules/auth/api`
Expected: FAIL — the six names are not exported.

- [ ] **Step 3: Write the six functions**

Append to `src/modules/auth/api/authApi.ts`:

```ts
/**
 * Step 1 of sign-up. Creates NO account — it records a pending registration and
 * emails a six-digit code.
 *
 * Answers 202 for a free address, for one already registering, and for one that
 * already has an account: the status cannot distinguish them, by design. What
 * differs is the email the address receives. Nothing to parse, and nothing a
 * caller may branch on.
 */
export const startSignUp = async (email: string): Promise<void> => {
  await api.post('/auth/register', { email });
};

/** Re-mints the code for a pending registration. 202 always; 60-second cooldown. */
export const resendVerificationCode = async (email: string): Promise<void> => {
  await api.post('/auth/email/verify/resend', { email });
};

/**
 * Step 2 of sign-up, and the step that CREATES the account — verified, with the
 * password sent in this request — and opens a session.
 *
 * The password belongs here and not in `startSignUp` because the code reaches
 * only the owner of the address: whoever confirms is whoever chooses the
 * password, which is what closes account pre-hijacking.
 */
export const confirmSignUp = async (input: ConfirmSignUpInput): Promise<SessionTokens> => {
  const payload = await api.post('/auth/email/verify', {
    ...input,
    refreshTransport: REFRESH_TRANSPORT_BODY,
  });

  return parseOrThrow(sessionTokensSchema, payload);
};

/**
 * Starts password recovery. 202 whether or not the address has an account — an
 * address with none receives nothing at all. Nothing to parse, and no branch a
 * caller is allowed to take.
 */
export const requestPasswordReset = async (email: string): Promise<void> => {
  await api.post('/auth/password/forgot', { email });
};

/**
 * Redeems the emailed token. Answers 204 and issues NO session: the API revokes
 * every session of the account, so the caller signs in again with the password
 * it just set.
 */
export const resetPassword = async (input: ResetPasswordInput): Promise<void> => {
  await api.post('/auth/password/reset', input);
};

/**
 * Replaces the password of the authenticated user. Revokes every other session
 * and answers with a fresh pair for this device — so the refresh token on disk
 * is dead the moment this resolves and the caller must persist the new one.
 */
export const changePassword = async (input: ChangePasswordInput): Promise<SessionTokens> => {
  const payload = await api.post('/auth/password', {
    ...input,
    refreshTransport: REFRESH_TRANSPORT_BODY,
  });

  return parseOrThrow(sessionTokensSchema, payload);
};
```

Declare the three input types just above them, in the same file:

```ts
interface ConfirmSignUpInput {
  email: string;
  code: string;
  password: string;
}

interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:ci -- src/modules/auth/api` then `pnpm check`
Expected: PASS, both.

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/api/authApi.ts src/modules/auth/api/authApi.test.ts
git commit -m "$(cat <<'MSG'
feat(auth): call the five endpoints that had no client

Verificação de e-mail (register, resend, confirm), recuperação (forgot,
reset) e troca de senha. Quatro delas respondem 202 ou 204 sem corpo e
não parseiam nada: parsear um corpo que a API não manda inventaria um
contrato.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: The validation vocabulary

Six forms cannot share one file and stay readable (D10). `validations/` becomes a folder of four, split by purpose rather than by form: `policy.ts` holds everything mirrored from the API plus the field schemas the others build on; the remaining three group the forms that belong together.

This task is additive. `signInSchema` and `signUpSchema` keep the shapes they have today — Task 8 narrows `signUpSchema` when the screen that uses it is rewritten, and doing it here would break `SignUpScreen` mid-plan.

The confirmation field is written as an inline `.refine` in each of the three schemas that take a new password, not extracted into a generic helper: the field it compares against differs (`password` on confirmation, `newPassword` on reset and change, matching the API's own body field names so `applyServerFieldErrors` can land a server error on the right input), and a generic over two zod object shapes costs more to read than the two lines it saves.

**Files:**
- Create: `src/modules/auth/validations/policy.ts`
- Create: `src/modules/auth/validations/verification.ts`
- Create: `src/modules/auth/validations/password.ts`
- Modify: `src/modules/auth/validations/credentials.ts` (keeps only the two schemas; everything shared moves to `policy.ts`)
- Modify: `src/modules/auth/validations/index.ts`
- Test: `src/modules/auth/validations/verification.test.ts`, `src/modules/auth/validations/password.test.ts` (create); `src/modules/auth/validations/credentials.test.ts` (unchanged — it imports from `./credentials`, which still exports both schemas)

**Interfaces:**
- Consumes: nothing.
- Produces, re-exported from `src/modules/auth/validations/index.ts`:
  - `VERIFICATION_CODE_DIGITS: 6`, `RESET_TOKEN_PATTERN`, `CONFIRM_PASSWORD_FIELD`, plus the four constants that move from `credentials.ts` unchanged.
  - `confirmSignUpSchema` → `ConfirmSignUpValues = { email, code, password, confirmPassword }`
  - `forgotPasswordSchema` → `ForgotPasswordValues = { email }`
  - `resetPasswordSchema` → `ResetPasswordValues = { token, newPassword, confirmPassword }`
  - `changePasswordSchema` → `ChangePasswordValues = { currentPassword, newPassword, confirmPassword }`

  Tasks 8, 9 and 10 use these as `zodResolver` inputs.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/auth/validations/verification.test.ts`:

```ts
import { confirmSignUpSchema } from './verification';

const VALID_EMAIL = 'user@example.com';
const VALID_CODE = '042317';
const VALID_PASSWORD = 'sup3rS3cret!';

const confirmWith = (overrides: Record<string, string>) =>
  confirmSignUpSchema.safeParse({
    email: VALID_EMAIL,
    code: VALID_CODE,
    password: VALID_PASSWORD,
    confirmPassword: VALID_PASSWORD,
    ...overrides,
  });

describe('confirmSignUpSchema', () => {
  it('accepts a six-digit code with a policy-satisfying password', () => {
    expect(confirmWith({}).success).toBe(true);
  });

  it('rejects a five-digit code', () => {
    expect(confirmWith({ code: '04231' }).success).toBe(false);
  });

  it('rejects a seven-digit code', () => {
    expect(confirmWith({ code: '0423178' }).success).toBe(false);
  });

  it('rejects a code with a letter in it', () => {
    expect(confirmWith({ code: '04231a' }).success).toBe(false);
  });

  it('enforces the full password policy, unlike sign-in', () => {
    expect(confirmWith({ password: 'password', confirmPassword: 'password' }).success).toBe(false);
  });

  it('rejects a confirmation that does not match', () => {
    expect(confirmWith({ confirmPassword: 'sup3rS3cret!!' }).success).toBe(false);
  });

  it('puts the mismatch on the confirmation field, where the user can see it', () => {
    const result = confirmWith({ confirmPassword: 'sup3rS3cret!!' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
  });
});
```

Create `src/modules/auth/validations/password.test.ts`:

```ts
import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from './password';

const VALID_EMAIL = 'user@example.com';
const VALID_TOKEN = 'Yk9wYVF1ZVRva2VuRXhhbXBsZVZhbHVlMTIzNDU2Nzg5';
const CURRENT_PASSWORD = 'sup3rS3cret!';
const NEW_PASSWORD = 'ev3nS4fer!';

describe('forgotPasswordSchema', () => {
  it('accepts a well-formed address', () => {
    expect(forgotPasswordSchema.safeParse({ email: VALID_EMAIL }).success).toBe(true);
  });

  it('rejects a malformed address', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  const resetWith = (overrides: Record<string, string>) =>
    resetPasswordSchema.safeParse({
      token: VALID_TOKEN,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
      ...overrides,
    });

  it('accepts a base64url token of the length the API emits', () => {
    expect(resetWith({}).success).toBe(true);
  });

  it('rejects a token far too short to be one', () => {
    expect(resetWith({ token: 'abc' }).success).toBe(false);
  });

  it('rejects a token carrying a character base64url has no room for', () => {
    expect(resetWith({ token: `${VALID_TOKEN.slice(0, -1)}+` }).success).toBe(false);
  });

  it('enforces the password policy on the new password', () => {
    expect(resetWith({ newPassword: 'password', confirmPassword: 'password' }).success).toBe(false);
  });

  it('rejects a confirmation that does not match', () => {
    expect(resetWith({ confirmPassword: CURRENT_PASSWORD }).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  const changeWith = (overrides: Record<string, string>) =>
    changePasswordSchema.safeParse({
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
      ...overrides,
    });

  it('accepts a policy-satisfying new password', () => {
    expect(changeWith({}).success).toBe(true);
  });

  it('checks presence only on the current password, as sign-in does', () => {
    // An account created under a looser policy must stay able to change its
    // password, and rejecting locally would claim the password is malformed
    // when the truth is only that the API has to judge it.
    expect(changeWith({ currentPassword: 'x' }).success).toBe(true);
  });

  it('rejects an empty current password', () => {
    expect(changeWith({ currentPassword: '' }).success).toBe(false);
  });

  it('enforces the password policy on the new password', () => {
    expect(changeWith({ newPassword: 'password', confirmPassword: 'password' }).success).toBe(
      false,
    );
  });

  it('rejects a confirmation that does not match', () => {
    expect(changeWith({ confirmPassword: CURRENT_PASSWORD }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:ci -- src/modules/auth/validations`
Expected: FAIL — `./verification` and `./password` do not exist.

- [ ] **Step 3: Create `policy.ts`**

Create `src/modules/auth/validations/policy.ts`, moving the four constants, `VALIDATION_COPY` and `emailSchema` out of `credentials.ts` and adding what the new forms need:

```ts
import { z } from 'zod';

/** All six mirror the API's value objects and route schemas — keep them in step. */
export const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_POLICY_PATTERN = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/s;
export const VERIFICATION_CODE_DIGITS = 6;
/**
 * base64url in a generous band. The exact length is an adapter detail on the
 * API side (32 random bytes, so 43 characters today), and this is SHAPE only —
 * whether the token is real, or still usable, is the API's single
 * `PASSWORD_RESET_FAILED` to give.
 */
export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

/** The field every new-password form compares against. Typed by `Path<T>` at each use. */
export const CONFIRM_PASSWORD_FIELD = 'confirmPassword';

/** Presence only, as on the server: see `signInSchema` in `credentials.ts`. */
const MIN_SUBMITTED_PASSWORD_LENGTH = 1;

const VERIFICATION_CODE_PATTERN = new RegExp(`^[0-9]{${VERIFICATION_CODE_DIGITS}}$`);

/**
 * Rendered straight to the user by react-hook-form, so these are copy, not
 * diagnostics: zod's defaults read like "Too small: expected string to have
 * >=8 characters". They live beside the rules they describe, and together with
 * `errorCopy.ts` they are the whole i18n seam of this module.
 */
export const VALIDATION_COPY = {
  email: 'Enter a valid email address.',
  passwordLength: `Use between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
  passwordPolicy: 'Include a letter, a digit and a symbol.',
  passwordRequired: 'Enter your password.',
  code: `Enter the ${VERIFICATION_CODE_DIGITS}-digit code from your email.`,
  token: 'Paste the token from the email we sent you.',
  passwordMismatch: 'The two passwords do not match.',
} as const;

export const emailSchema = z
  .string()
  .trim()
  .max(MAX_EMAIL_LENGTH, VALIDATION_COPY.email)
  .pipe(z.email(VALIDATION_COPY.email));

/** The full registration policy. Used wherever the user CHOOSES a password. */
export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, VALIDATION_COPY.passwordLength)
  .max(MAX_PASSWORD_LENGTH, VALIDATION_COPY.passwordLength)
  .regex(PASSWORD_POLICY_PATTERN, VALIDATION_COPY.passwordPolicy);

/** Presence and a ceiling. Used wherever the user PROVES a password they already have. */
export const submittedPasswordSchema = z
  .string()
  .min(MIN_SUBMITTED_PASSWORD_LENGTH, VALIDATION_COPY.passwordRequired)
  .max(MAX_PASSWORD_LENGTH, VALIDATION_COPY.passwordLength);

/** Shape only. Whether the code is the right one is the API's to answer. */
export const verificationCodeSchema = z
  .string()
  .trim()
  .regex(VERIFICATION_CODE_PATTERN, VALIDATION_COPY.code);

/** Shape only, for the same reason as the code. */
export const resetTokenSchema = z.string().trim().regex(RESET_TOKEN_PATTERN, VALIDATION_COPY.token);
```

- [ ] **Step 4: Reduce `credentials.ts` to its two schemas**

Rewrite `src/modules/auth/validations/credentials.ts` so it holds only the two schemas and imports the rest:

```ts
import { z } from 'zod';

import { emailSchema, newPasswordSchema, submittedPasswordSchema } from './policy';

/** Registration enforces the policy the API publishes. */
export const signUpSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
});

/**
 * Sign-in checks presence, not policy — the same choice the API makes and for
 * the same reason: an account created under a looser policy must stay able to
 * log in, and rejecting locally would tell the user their password is malformed
 * when the truth is that it is wrong.
 */
export const signInSchema = z.object({
  email: emailSchema,
  password: submittedPasswordSchema,
});

export type Credentials = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
```

- [ ] **Step 5: Create `verification.ts`**

```ts
import { z } from 'zod';

import {
  CONFIRM_PASSWORD_FIELD,
  emailSchema,
  newPasswordSchema,
  VALIDATION_COPY,
  verificationCodeSchema,
} from './policy';

/**
 * Step 2 of sign-up. `password` is named as the API names it, so a `details[]`
 * entry from a 400 lands on the input the user is looking at.
 *
 * `confirmPassword` never leaves the client: the API's body has no place for
 * it. It is here because this form is the only chance to catch a typo before
 * the password becomes the account's.
 */
export const confirmSignUpSchema = z
  .object({
    email: emailSchema,
    code: verificationCodeSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: VALIDATION_COPY.passwordMismatch,
    path: [CONFIRM_PASSWORD_FIELD],
  });

export type ConfirmSignUpValues = z.infer<typeof confirmSignUpSchema>;
```

- [ ] **Step 6: Create `password.ts`**

```ts
import { z } from 'zod';

import {
  CONFIRM_PASSWORD_FIELD,
  emailSchema,
  newPasswordSchema,
  resetTokenSchema,
  submittedPasswordSchema,
  VALIDATION_COPY,
} from './policy';

export const forgotPasswordSchema = z.object({ email: emailSchema });

/**
 * No email: the API's body is `{ token, newPassword }` and `.strict()`. The
 * address the recovery started from is carried as a route param, for the sign-in
 * form the user lands on afterwards.
 */
export const resetPasswordSchema = z
  .object({
    token: resetTokenSchema,
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: VALIDATION_COPY.passwordMismatch,
    path: [CONFIRM_PASSWORD_FIELD],
  });

/**
 * `currentPassword` is presence-only, exactly as `signInSchema` is and for the
 * same reason. Whether it is the right one is a 422 the API owns.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: submittedPasswordSchema,
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: VALIDATION_COPY.passwordMismatch,
    path: [CONFIRM_PASSWORD_FIELD],
  });

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
```

- [ ] **Step 7: Rewrite the barrel**

`src/modules/auth/validations/index.ts`:

```ts
export { type Credentials, type SignUpValues, signInSchema, signUpSchema } from './credentials';
export {
  type ChangePasswordValues,
  changePasswordSchema,
  type ForgotPasswordValues,
  forgotPasswordSchema,
  type ResetPasswordValues,
  resetPasswordSchema,
} from './password';
export {
  CONFIRM_PASSWORD_FIELD,
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_POLICY_PATTERN,
  RESET_TOKEN_PATTERN,
  VERIFICATION_CODE_DIGITS,
} from './policy';
export { type ConfirmSignUpValues, confirmSignUpSchema } from './verification';
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test:ci` then `pnpm check`
Expected: PASS, both. `credentials.test.ts` must still pass untouched — if it does not, `policy.ts` changed a rule instead of moving it.

- [ ] **Step 9: Commit**

```bash
git add src/modules/auth/validations
git commit -m "$(cat <<'MSG'
feat(auth): split validations and add the four new form schemas

Seis formulários não cabem num arquivo. policy.ts passa a guardar tudo
que espelha a API — constantes, copy e os schemas de campo — e os outros
três agrupam os formulários que andam juntos.

A confirmação de senha é um .refine inline nos três schemas que escolhem
senha, e não um helper genérico: o campo comparado muda de nome entre
eles (password vs newPassword, seguindo o body da API para o erro de
campo cair no input certo).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: Three new kinds of field

`FormTextField` already states the rule this follows: keyboard behaviour belongs to the kind of field, not to the call site. Three kinds arrive with the new forms, and each carries a platform behaviour that is wrong by default.

`TOKEN` is the one worth reading twice: a pasted base64url string meets autocapitalisation and autocorrect turned on by default, and either one silently produces a token the API will reject with the same generic error it gives a token that never existed. The user would have no way to tell.

**Files:**
- Modify: `src/modules/auth/components/FormTextField.tsx`
- Test: `src/modules/auth/components/FormTextField.test.tsx` (create)

**Interfaces:**
- Consumes: `VERIFICATION_CODE_DIGITS` from `../validations` (Task 3).
- Produces: `FIELD_TYPES.CODE`, `FIELD_TYPES.NEW_PASSWORD`, `FIELD_TYPES.TOKEN` — Tasks 8, 9 and 10 use them.

- [ ] **Step 1: Write the failing test**

Create `src/modules/auth/components/FormTextField.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';

import { VERIFICATION_CODE_DIGITS } from '../validations';
import { FIELD_TYPES, type FieldType, FormTextField } from './FormTextField';

const LABEL = 'Field under test';

interface Values {
  value: string;
}

const Host = ({ type }: { type: FieldType }) => {
  const { control } = useForm<Values>({ defaultValues: { value: '' } });

  return <FormTextField control={control} label={LABEL} name="value" type={type} />;
};

const renderField = async (type: FieldType) => render(<Host type={type} />);

describe('FormTextField', () => {
  it('gives a verification code a numeric keypad and the one-time-code hint', async () => {
    await renderField(FIELD_TYPES.CODE);

    const input = screen.getByLabelText(LABEL);

    expect(input.props.keyboardType).toBe('number-pad');
    expect(input.props.autoComplete).toBe('one-time-code');
    expect(input.props.maxLength).toBe(VERIFICATION_CODE_DIGITS);
  });

  it('asks the password manager to generate rather than to fill a new password', async () => {
    await renderField(FIELD_TYPES.NEW_PASSWORD);

    const input = screen.getByLabelText(LABEL);

    expect(input.props.autoComplete).toBe('new-password');
    expect(input.props.secureTextEntry).toBe(true);
  });

  it('keeps a pasted token intact, with no autocorrect and no autocapitalisation', async () => {
    // Either one silently produces a token the API rejects with the same
    // generic error it gives an invented one — the user could not tell why.
    await renderField(FIELD_TYPES.TOKEN);

    const input = screen.getByLabelText(LABEL);

    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.secureTextEntry).toBe(false);
  });

  it('leaves the existing kinds alone', async () => {
    await renderField(FIELD_TYPES.EMAIL);

    expect(screen.getByLabelText(LABEL).props.keyboardType).toBe('email-address');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:ci -- src/modules/auth/components`
Expected: FAIL — `FIELD_TYPES.CODE` does not exist.

- [ ] **Step 3: Add the three kinds**

In `src/modules/auth/components/FormTextField.tsx`, import `VERIFICATION_CODE_DIGITS` from `../validations`, extend `FIELD_TYPES`:

```ts
export const FIELD_TYPES = {
  EMAIL: 'email',
  PASSWORD: 'password',
  NEW_PASSWORD: 'newPassword',
  CODE: 'code',
  TOKEN: 'token',
} as const;
```

and extend `INPUT_PROPS_BY_TYPE` with three entries. `autoCorrect` and `maxLength` are new keys, so add them to every entry — a partial record would make the props depend on which branch ran:

```ts
  [FIELD_TYPES.NEW_PASSWORD]: {
    keyboardType: 'default',
    autoCapitalize: 'none',
    // `new-password`, not `current-password`: this is what makes the platform
    // password manager offer to generate and store one instead of filling the
    // old one back in.
    autoComplete: 'new-password',
    autoCorrect: false,
    secureTextEntry: true,
    maxLength: undefined,
  },
  [FIELD_TYPES.CODE]: {
    keyboardType: 'number-pad',
    autoCapitalize: 'none',
    autoComplete: 'one-time-code',
    autoCorrect: false,
    secureTextEntry: false,
    // The code has exactly this many digits, so the keyboard stops accepting a
    // seventh rather than letting the user find out at submit.
    maxLength: VERIFICATION_CODE_DIGITS,
  },
  [FIELD_TYPES.TOKEN]: {
    keyboardType: 'default',
    autoCapitalize: 'none',
    autoComplete: 'off',
    autoCorrect: false,
    secureTextEntry: false,
    maxLength: undefined,
  },
```

Add `autoCorrect: false` and `maxLength: undefined` to the existing `EMAIL` and `PASSWORD` entries too.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:ci -- src/modules/auth/components` then `pnpm check`
Expected: PASS, both.

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/components/FormTextField.tsx src/modules/auth/components/FormTextField.test.tsx
git commit -m "$(cat <<'MSG'
feat(auth): add code, new-password and token field kinds

O TOKEN é o que vale ler duas vezes: um base64url colado encontra
autocorreção e autocapitalização ligadas por padrão, e qualquer uma das
duas produz em silêncio um token que a API recusa com o mesmo erro
genérico que daria a um token inventado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: Copy for the module's codes, and a field mapper that works for six forms

`applyServerFieldErrors` is hardcoded to `Credentials` and to the two field names `email` and `password`. Five more forms need it, with five different field sets, so it becomes generic over `FieldValues` and takes the fields the calling form recognises.

The allowlist stays rather than trusting `details[].field` blindly: that value is a server-side field name, and setting an error on a field the form does not render leaves the user with a form that refuses to submit and shows nothing. `Path<TValues>` is what makes each list checked against its own schema, so a typo is a compile error rather than a silently dead branch.

The three codes that were already in `API_ERROR_CODES` with no copy — `USER_NOT_FOUND`, `INVALID_EMAIL`, `INVALID_PASSWORD` — get it here: all three can now surface from confirm, reset and change.

**Files:**
- Modify: `src/modules/auth/errorCopy.ts`
- Modify: `src/modules/auth/screens/SignInScreen.tsx` (call site), `src/modules/auth/screens/SignUpScreen.tsx` (call site)
- Test: `src/modules/auth/errorCopy.test.ts` (create)

**Interfaces:**
- Consumes: `API_ERROR_CODES`, `ApiError` from `@/lib`.
- Produces: `applyServerFieldErrors<TValues extends FieldValues>(error: unknown, setError: UseFormSetError<TValues>, fields: readonly Path<TValues>[]): void`, and `AUTH_ERROR_COPY` carrying eleven entries. Tasks 8, 9 and 10 call the new signature.

- [ ] **Step 1: Write the failing test**

Create `src/modules/auth/errorCopy.test.ts`:

```ts
import type { UseFormSetError } from 'react-hook-form';

import { API_ERROR_CODES, ApiError } from '@/lib';

import { applyServerFieldErrors, AUTH_ERROR_COPY } from './errorCopy';

interface Values {
  email: string;
  code: string;
}

const FIELDS = ['email', 'code'] as const;

const validationError = (field: string) =>
  new ApiError({
    status: 400,
    code: API_ERROR_CODES.VALIDATION_ERROR,
    message: 'never rendered',
    details: [{ field, code: 'invalid_format' }],
  });

describe('applyServerFieldErrors', () => {
  it('puts a server field error on the matching form field', () => {
    const setError = jest.fn() as unknown as UseFormSetError<Values>;

    applyServerFieldErrors<Values>(validationError('email'), setError, FIELDS);

    expect(setError).toHaveBeenCalledWith('email', { message: 'The server rejected this value.' });
  });

  it('ignores a field this form does not render', () => {
    // Otherwise the form refuses to submit and shows nothing to fix.
    const setError = jest.fn() as unknown as UseFormSetError<Values>;

    applyServerFieldErrors<Values>(validationError('password'), setError, FIELDS);

    expect(setError).not.toHaveBeenCalled();
  });

  it('ignores an error that is not an ApiError', () => {
    const setError = jest.fn() as unknown as UseFormSetError<Values>;

    applyServerFieldErrors<Values>(new Error('boom'), setError, FIELDS);

    expect(setError).not.toHaveBeenCalled();
  });
});

describe('AUTH_ERROR_COPY', () => {
  it('gives every failure mode of the verification code the same words', () => {
    // The API answers one code for unknown, wrong, expired and exhausted. Copy
    // that guessed between them would be inventing an oracle the API refused.
    expect(AUTH_ERROR_COPY[API_ERROR_CODES.EMAIL_VERIFICATION_FAILED]).toBe(
      'That code is not valid. Request a new one and try again.',
    );
  });

  it('says nothing about which reset-token failure happened', () => {
    expect(AUTH_ERROR_COPY[API_ERROR_CODES.PASSWORD_RESET_FAILED]).toBe(
      'That token is not valid. Start the recovery again to get a new one.',
    );
  });

  it('carries no entry for a code the API can no longer send', () => {
    expect(Object.keys(AUTH_ERROR_COPY)).not.toContain('EMAIL_ALREADY_IN_USE');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:ci -- src/modules/auth/errorCopy`
Expected: FAIL — `applyServerFieldErrors` takes two arguments, and the new copy keys are missing.

- [ ] **Step 3: Rewrite `errorCopy.ts`**

```ts
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { API_ERROR_CODES, ApiError } from '@/lib';

/**
 * This module's domain codes only. Everything a module can receive whatever it
 * asked for — network, 500, 429, a drifted contract — lives in `@/errors`, and
 * `App.tsx` registers this map there.
 */
export const AUTH_ERROR_COPY = {
  [API_ERROR_CODES.INVALID_CREDENTIALS]: 'Email or password is incorrect.',
  [API_ERROR_CODES.INVALID_REFRESH_TOKEN]: 'Your session has expired. Please sign in again.',
  [API_ERROR_CODES.REFRESH_TOKEN_REUSED]:
    'Your session was ended for security. Please sign in again.',
  /**
   * One message for unknown, wrong, expired and attempts-exhausted, because the
   * API answers one code for all four. Wording that guessed between them would
   * hand back the oracle the API deliberately withheld.
   */
  [API_ERROR_CODES.EMAIL_VERIFICATION_FAILED]:
    'That code is not valid. Request a new one and try again.',
  /** Same reasoning: one code for unknown, wrong, expired and already used. */
  [API_ERROR_CODES.PASSWORD_RESET_FAILED]:
    'That token is not valid. Start the recovery again to get a new one.',
  /**
   * The account exists but is unverified. No route out of here in the app: the
   * pending registration was consumed when the account was created, so `resend`
   * would find nothing and `confirm` could never succeed. Copy only.
   */
  [API_ERROR_CODES.EMAIL_NOT_VERIFIED]:
    'Confirm your email address before signing in. Check your inbox.',
  [API_ERROR_CODES.INVALID_CURRENT_PASSWORD]: 'That is not your current password.',
  [API_ERROR_CODES.PASSWORD_UNCHANGED]: 'Choose a password different from your current one.',
  [API_ERROR_CODES.USER_NOT_FOUND]: 'That account no longer exists.',
  [API_ERROR_CODES.INVALID_EMAIL]: 'That email address is not valid.',
  [API_ERROR_CODES.INVALID_PASSWORD]: 'That password does not meet the requirements.',
} as const;

const SERVER_FIELD_MESSAGE = 'The server rejected this value.';

/**
 * Puts the API's per-field `details[]` where react-hook-form already renders
 * local errors, so server validation and client validation land in the same
 * place on the screen.
 *
 * `fields` is an allowlist, not a convenience: `details[].field` is a
 * server-side name, and setting an error on a field the form does not render
 * gives the user a form that refuses to submit with nothing visible to fix.
 * Typing it as `Path<TValues>` is what checks each list against its own schema.
 */
export const applyServerFieldErrors = <TValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TValues>,
  fields: readonly Path<TValues>[],
): void => {
  if (!(error instanceof ApiError)) return;

  for (const detail of error.details) {
    const field = fields.find((candidate) => candidate === detail.field);

    if (field !== undefined) setError(field, { message: SERVER_FIELD_MESSAGE });
  }
};
```

- [ ] **Step 4: Update the two existing call sites**

In `src/modules/auth/screens/SignInScreen.tsx`, add near `COPY`:

```ts
/** Checked against `Credentials` by `Path<T>`, so a typo here is a compile error. */
const FIELDS = ['email', 'password'] as const;
```

and change the call to `applyServerFieldErrors(error, setError, FIELDS);`. Make the identical change in `src/modules/auth/screens/SignUpScreen.tsx`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:ci` then `pnpm check`
Expected: PASS, both.

- [ ] **Step 6: Commit**

```bash
git add src/modules/auth/errorCopy.ts src/modules/auth/errorCopy.test.ts src/modules/auth/screens/SignInScreen.tsx src/modules/auth/screens/SignUpScreen.tsx
git commit -m "$(cat <<'MSG'
feat(auth): copy for the new codes, and a field mapper six forms can use

applyServerFieldErrors deixa de ser específico de Credentials. A lista de
campos continua sendo allowlist: details[].field é nome do servidor, e
marcar um campo que o formulário não renderiza deixa o usuário com um
form que se recusa a enviar e não mostra o que corrigir.

Verificação e reset ganham uma mensagem só cada, porque a API responde um
código só para todos os modos de falha — texto que adivinhasse entre eles
devolveria o oráculo que a API recusou de propósito.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: The session machinery moves into a hook of its own

A pure refactor, and the existing `AuthContext.test.tsx` is the gate: it must pass untouched. If it does not, behaviour changed.

`AuthContext.tsx` is ~250 lines before the two new mutations arrive. This lifts everything except the mutations into `useAuthSession`, and introduces the two session primitives of D2, which the refresh runner already open-codes:

- **`adoptTokens(tokens)`** — persist the refresh token, then apply the access token. The write comes first, and must: the token just spent must not survive a relaunch, and a process death in that gap leaves a spent token on disk, which is exactly what the API's 30-second grace window forgives.
- **`openSession(tokens)`** — `adoptTokens`, then `fetchQuery` the profile, so the user is in the cache before the promise resolves.

**Files:**
- Create: `src/modules/auth/hooks/useAuthSession.ts`
- Modify: `src/modules/auth/context/AuthContext.tsx`
- Test: `src/modules/auth/context/AuthContext.test.tsx` (must pass **unchanged**)

**Interfaces:**
- Consumes: `fetchMe`, `login`, `refreshSession` from `../api/authApi`; `AUTH_QUERY_KEYS` from `../constants`; storage; `resolveStatus`, `isEndedSession` from `../utils/session`; `createSingleFlight` from `../utils/singleFlight`; `configureAuthorization` from `@/lib`; `reportError` from `@/errors`.
- Produces: `useAuthSession(): AuthSessionValue`, where

```ts
export interface AuthSessionValue {
  status: AuthStatus;
  user: User | null;
  adoptTokens: (tokens: SessionTokens) => Promise<void>;
  openSession: (tokens: SessionTokens) => Promise<void>;
  endSession: () => Promise<void>;
}
```

  Task 7 consumes all five.

- [ ] **Step 1: Create the hook**

Create `src/modules/auth/hooks/useAuthSession.ts` and move into it, verbatim except where noted, everything currently in `AuthProvider` other than the four mutations and the `useMemo` that builds the context value: the `token` state and `tokenRef`, `applyToken`, `meQuery`, `endSession`, `refreshAccessToken`, the `configureAuthorization` effect, the boot effect, the boot-completion effect, and the effect that clears a token the API rejected. Keep every comment — they explain decisions, not lines.

Three changes, and only three:

```ts
/**
 * Persist first, then apply. The token just spent must not survive a relaunch,
 * and a process death in this gap leaves a spent token on disk — which is
 * exactly what the API's 30-second grace window exists to forgive.
 */
const adoptTokens = useCallback(
  async ({ accessToken, refreshToken }: SessionTokens) => {
    await writeRefreshToken(refreshToken);
    applyToken(accessToken);
  },
  [applyToken],
);

/**
 * `fetchQuery`, not an invalidation: the user has to be in the cache before
 * this resolves, so the navigator swaps in the same tick the screen stops
 * submitting. `networkMode: 'always'` for the same reason as `meQuery` — this
 * imperative call has its own default and does not inherit the hook's option.
 */
const openSession = useCallback(
  async (tokens: SessionTokens) => {
    await adoptTokens(tokens);
    await queryClient.fetchQuery({
      queryKey: AUTH_QUERY_KEYS.ME,
      queryFn: fetchMe,
      networkMode: 'always',
    });
  },
  [adoptTokens, queryClient],
);
```

and, inside `refreshAccessToken`, replace the inline write-then-apply pair with `await adoptTokens({ accessToken, refreshToken });` — then `adoptTokens` must be listed in that `useMemo`'s dependency array in place of `applyToken`.

Return the five members of `AuthSessionValue`, with `status: resolveStatus({ hasCompletedBoot, token, user })` and the `user` derivation kept exactly as it is (gated on the token, not read off the query — an emptied cache schedules no render).

- [ ] **Step 2: Reduce `AuthContext.tsx` to the provider plus its mutations**

`AuthContext.tsx` keeps the four existing mutations, and now takes `openSession` and `endSession` from the hook. `establishSession` becomes:

```ts
const establishSession = useCallback(
  async (credentials: Credentials) => openSession(await login(credentials)),
  [openSession],
);
```

Everything the hook now owns is deleted from this file, including its imports.

- [ ] **Step 3: Run the tests to verify nothing changed**

Run: `pnpm test:ci -- src/modules/auth/context` then `pnpm check`
Expected: PASS, both, with `AuthContext.test.tsx` **not edited**. A failure here is a behaviour change, not a test to update.

- [ ] **Step 4: Commit**

```bash
git add src/modules/auth/hooks/useAuthSession.ts src/modules/auth/context/AuthContext.tsx
git commit -m "$(cat <<'MSG'
refactor(auth): move the session machinery into useAuthSession

Boot, token, refresh single-flight e meQuery saem do provider. Aparecem
as duas primitivas que o runner de refresh já fazia à mão: adoptTokens
(grava e aplica, nessa ordem) e openSession (adoptTokens + o /me que
precisa estar no cache antes da promise resolver).

Refactor puro: AuthContext.test.tsx passa sem uma linha de mudança.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: `confirmSignUp` and `changePassword` join the context

The mutations move out of the provider into a hook of their own, and two arrive. Additive: `signUp` stays until Task 9 removes the screen that calls it.

The asymmetry between the two new ones is the point:

- `confirmSignUp` opens a session with `openSession`, and navigates nowhere. `RootStack` renders one side or the other, so the screen unmounts on its own the moment `status` becomes `signedIn` — the same way `signIn` already works.
- `changePassword` uses `adoptTokens` and **not** `openSession`. The profile is cached and unchanged; the reason to write at all is that the API just revoked the refresh token sitting on disk and handed back a replacement. Skipping the write would sign the user out at the next refresh.

**Files:**
- Create: `src/modules/auth/hooks/useAuthActions.ts`
- Modify: `src/modules/auth/context/AuthContext.tsx`, `src/modules/auth/types.ts`
- Test: `src/modules/auth/context/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `AuthSessionValue` from `./useAuthSession` (Task 6); `confirmSignUp`, `changePassword` from `../api/authApi` (Task 2); `ConfirmSignUpValues`, `ChangePasswordValues` from `../validations` (Task 3).
- Produces: `useAuthActions(session: AuthSessionValue): AuthActionsValue`, and `AuthContextValue` gains

```ts
  confirmSignUp: (values: ConfirmSignUpValues) => Promise<void>;
  changePassword: (values: ChangePasswordValues) => Promise<void>;
```

  Tasks 9 and 11 call them through `useAuth()`.

- [ ] **Step 1: Write the failing tests**

In `src/modules/auth/context/AuthContext.test.tsx`: import the two new API functions and mock them alongside the others, add two probe buttons, and add these cases inside `describe('AuthProvider')`:

```tsx
const CONFIRM_SIGN_UP_LABEL = 'probe-confirm-sign-up';
const CHANGE_PASSWORD_LABEL = 'probe-change-password';

const CONFIRMATION = {
  email: CREDENTIALS.email,
  code: '042317',
  password: CREDENTIALS.password,
  confirmPassword: CREDENTIALS.password,
};

const PASSWORD_CHANGE = {
  currentPassword: CREDENTIALS.password,
  newPassword: 'ev3nS4fer!',
  confirmPassword: 'ev3nS4fer!',
};
```

```tsx
  it('confirms the sign-up, storing the refresh token and exposing the user', async () => {
    mockReadRefreshToken.mockResolvedValue(null);
    mockConfirmSignUp.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
    });
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderProvider();
    await fireEvent.press(screen.getByText(CONFIRM_SIGN_UP_LABEL));

    expect(await screen.findByText(`status:signedIn`)).toBeTruthy();
    expect(mockWriteRefreshToken).toHaveBeenCalledWith(REFRESH_TOKEN);
    // The account is created by this call, so nothing logs in afterwards.
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('persists the replacement refresh token when the password changes', async () => {
    mockReadRefreshToken.mockResolvedValue(REFRESH_TOKEN);
    mockRefreshSession.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
    });
    mockFetchMe.mockResolvedValue(PROFILE);
    mockChangePassword.mockResolvedValue(rotatedPair);

    await renderProvider();
    expect(await screen.findByText(`status:signedIn`)).toBeTruthy();

    await fireEvent.press(screen.getByText(CHANGE_PASSWORD_LABEL));

    // The API revoked every other session and handed this device a new pair.
    // Not writing it would sign this device out at the next refresh.
    await screen.findByText(`status:signedIn`);
    expect(mockWriteRefreshToken).toHaveBeenLastCalledWith(ROTATED_REFRESH_TOKEN);
  });

  it('keeps the session when the password change is refused', async () => {
    mockReadRefreshToken.mockResolvedValue(REFRESH_TOKEN);
    mockRefreshSession.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
    });
    mockFetchMe.mockResolvedValue(PROFILE);
    mockChangePassword.mockRejectedValue(
      new ApiError({
        status: 422,
        code: API_ERROR_CODES.INVALID_CURRENT_PASSWORD,
        message: 'never rendered',
      }),
    );

    await renderProvider();
    expect(await screen.findByText(`status:signedIn`)).toBeTruthy();

    await fireEvent.press(screen.getByText(CHANGE_PASSWORD_LABEL));

    expect(await screen.findByText(`status:signedIn`)).toBeTruthy();
    expect(mockClearRefreshToken).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:ci -- src/modules/auth/context`
Expected: FAIL — `confirmSignUp` and `changePassword` are not on the context value.

- [ ] **Step 3: Create `useAuthActions.ts`**

Move the four existing mutations out of `AuthContext.tsx` into `src/modules/auth/hooks/useAuthActions.ts` verbatim, comments included, and add the two new ones. Every mutation keeps `networkMode: 'always'` — the app-wide default pauses while offline, which would leave a submit stuck forever instead of failing.

The two new API functions share their names with the context members they feed,
so they are imported aliased — `confirmSignUp` meaning two different things in
one file is how a later edit calls the wrong one:

```ts
import {
  changePassword as changePasswordRequest,
  confirmSignUp as confirmSignUpRequest,
  fetchMe,
  login,
  logout,
  logoutEverywhere,
} from '../api/authApi';
```

```ts
export interface AuthActionsValue {
  signIn: (credentials: Credentials) => Promise<void>;
  signUp: (credentials: Credentials) => Promise<void>;
  confirmSignUp: (values: ConfirmSignUpValues) => Promise<void>;
  changePassword: (values: ChangePasswordValues) => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  isSubmitting: boolean;
  isSigningOut: boolean;
}

export const useAuthActions = ({
  adoptTokens,
  openSession,
  endSession,
}: AuthSessionValue): AuthActionsValue => {
  const queryClient = useQueryClient();

  /* the four existing mutations, unchanged */

  const confirmSignUpMutation = useMutation({
    mutationFn: async ({ email, code, password }: ConfirmSignUpValues) => {
      // `confirmPassword` is a client-only field and is deliberately not
      // forwarded: the API's body has no place for it.
      await openSession(await confirmSignUpRequest({ email, code, password }));
    },
    networkMode: 'always',
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ currentPassword, newPassword }: ChangePasswordValues) => {
      // `adoptTokens` and not `openSession`: the profile is already cached and
      // unchanged. What must happen is the write — the API revoked every other
      // session and the refresh token on disk is dead.
      await adoptTokens(await changePasswordRequest({ currentPassword, newPassword }));
    },
    networkMode: 'always',
  });

  return useMemo(
    () => ({
      signIn: signInMutation.mutateAsync,
      signUp: signUpMutation.mutateAsync,
      confirmSignUp: confirmSignUpMutation.mutateAsync,
      changePassword: changePasswordMutation.mutateAsync,
      signOut: signOutMutation.mutateAsync,
      signOutEverywhere: signOutEverywhereMutation.mutateAsync,
      isSubmitting:
        signInMutation.isPending ||
        signUpMutation.isPending ||
        confirmSignUpMutation.isPending ||
        changePasswordMutation.isPending,
      isSigningOut: signOutMutation.isPending || signOutEverywhereMutation.isPending,
    }),
    [
      signInMutation.mutateAsync,
      signInMutation.isPending,
      signUpMutation.mutateAsync,
      signUpMutation.isPending,
      confirmSignUpMutation.mutateAsync,
      confirmSignUpMutation.isPending,
      changePasswordMutation.mutateAsync,
      changePasswordMutation.isPending,
      signOutMutation.mutateAsync,
      signOutMutation.isPending,
      signOutEverywhereMutation.mutateAsync,
      signOutEverywhereMutation.isPending,
    ],
  );
};
```

The memo is what makes `actions` a stable dependency for the provider's own
`useMemo`; a missing entry in that array is a stale callback, not a lint
warning. Task 9 removes the two `signUpMutation` lines along with the mutation.

`establishSession` moves here too, now written against `openSession`.

- [ ] **Step 4: Reduce `AuthContext.tsx` to composition**

```tsx
export const AuthProvider = ({ children }: PropsWithChildren) => {
  const session = useAuthSession();
  const actions = useAuthActions(session);

  const value = useMemo<AuthContextValue>(
    () => ({ status: session.status, user: session.user, ...actions }),
    [session.status, session.user, actions],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
```

`useAuthActions` must therefore return a memoised object, so `actions` is a stable dependency — wrap its return value in `useMemo` over the six callbacks and the two booleans.

- [ ] **Step 5: Extend `types.ts`**

Add `confirmSignUp` and `changePassword` to `AuthContextValue`, each with a docblock:

```ts
  /**
   * Redeems the emailed code together with the chosen password. This is what
   * CREATES the account and opens the session — nothing logs in afterwards.
   */
  confirmSignUp: (values: ConfirmSignUpValues) => Promise<void>;
  /**
   * Replaces the password and adopts the pair the API hands back. Every other
   * device is signed out; this one stays signed in. Rejects on failure so the
   * screen can put the reason on the field it belongs to.
   */
  changePassword: (values: ChangePasswordValues) => Promise<void>;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test:ci` then `pnpm check`
Expected: PASS, both.

- [ ] **Step 7: Commit**

```bash
git add src/modules/auth/hooks/useAuthActions.ts src/modules/auth/context src/modules/auth/types.ts
git commit -m "$(cat <<'MSG'
feat(auth): confirmSignUp and changePassword entram no contexto

As mutations saem do provider para um hook próprio e duas chegam.

changePassword usa adoptTokens e não openSession: o perfil já está em
cache e não mudou. O que precisa acontecer é a gravação — a API revogou
todas as outras sessões e o refresh token no disco está morto.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: The resend cooldown

A hook of its own rather than state inside `VerifyEmailScreen`, because it is the one piece of that screen with a timer to test, and because a screen with a form, a mutation and a countdown in one file is where the file stops being readable.

The rule it encodes is D12: the countdown restarts when the button is pressed, **whatever the API answered**. A resend inside the server's own 60-second cooldown answers `202` and sends nothing, indistinguishable from one that worked — and the UI must not leak past that.

**Files:**
- Create: `src/modules/auth/hooks/useResendCooldown.ts`
- Test: `src/modules/auth/hooks/useResendCooldown.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `useResendCooldown(initialSeconds: number): { secondsLeft: number; restart: () => void }` — Task 9 uses it.

- [ ] **Step 1: Write the failing test**

Create `src/modules/auth/hooks/useResendCooldown.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react-native';

import { useResendCooldown } from './useResendCooldown';

const COOLDOWN_SECONDS = 60;
const ONE_SECOND_MS = 1000;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useResendCooldown', () => {
  it('starts at the seconds it was given', () => {
    const { result } = renderHook(() => useResendCooldown(COOLDOWN_SECONDS));

    expect(result.current.secondsLeft).toBe(COOLDOWN_SECONDS);
  });

  it('starts ready when it was given none', () => {
    const { result } = renderHook(() => useResendCooldown(0));

    expect(result.current.secondsLeft).toBe(0);
  });

  it('counts down one second at a time', () => {
    const { result } = renderHook(() => useResendCooldown(COOLDOWN_SECONDS));

    act(() => {
      jest.advanceTimersByTime(ONE_SECOND_MS * 3);
    });

    expect(result.current.secondsLeft).toBe(COOLDOWN_SECONDS - 3);
  });

  it('stops at zero instead of going negative', () => {
    const { result } = renderHook(() => useResendCooldown(2));

    act(() => {
      jest.advanceTimersByTime(ONE_SECOND_MS * 10);
    });

    expect(result.current.secondsLeft).toBe(0);
  });

  it('restarts on demand, which is what the resend button does', () => {
    const { result } = renderHook(() => useResendCooldown(0));

    act(() => {
      result.current.restart();
    });

    expect(result.current.secondsLeft).toBe(COOLDOWN_SECONDS);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:ci -- src/modules/auth/hooks/useResendCooldown`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the hook**

```ts
import { useCallback, useEffect, useState } from 'react';

/** Mirrors the API's own resend cooldown, per account. */
export const RESEND_COOLDOWN_SECONDS = 60;

const ONE_SECOND_MS = 1000;
const READY = 0;

/**
 * A countdown that gates the resend button.
 *
 * The hook owns the counting and nothing else. WHEN to restart is the caller's
 * decision — see `VerifyEmailScreen`, which restarts on a resolved resend
 * without asking whether the API actually sent anything: a resend inside the
 * server's own cooldown answers 202 and sends nothing, indistinguishable from
 * one that worked.
 *
 * One `setTimeout` per tick rather than a single `setInterval`: the effect
 * re-runs on each value, so the cleanup cancels exactly one pending timer and
 * an unmount mid-countdown leaves nothing behind.
 */
export const useResendCooldown = (initialSeconds: number) => {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (secondsLeft === READY) return;

    const timer = setTimeout(() => setSecondsLeft((current) => current - 1), ONE_SECOND_MS);

    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const restart = useCallback(() => setSecondsLeft(RESEND_COOLDOWN_SECONDS), []);

  return { secondsLeft, restart };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:ci -- src/modules/auth/hooks/useResendCooldown` then `pnpm check`
Expected: PASS, both.

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/hooks/useResendCooldown.ts src/modules/auth/hooks/useResendCooldown.test.ts
git commit -m "$(cat <<'MSG'
feat(auth): add the resend cooldown countdown

restart() é chamado ao apertar o botão e nunca em resposta ao que a API
respondeu: um reenvio dentro do cooldown do servidor responde 202 e não
manda nada, indistinguível de um que funcionou. Ramificar na resposta
vazaria uma diferença que a API recusa expor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 9: Sign-up becomes three steps

The cutover, and the task that makes the app work again. Everything here moves together because none of it compiles apart: the screen cannot lose its password field until the schema does, the schema cannot narrow until the screen stops reading `password`, and `signUp` cannot leave the context until nothing calls it.

`startSignUp` and `resendVerificationCode` are called by their screens through `useMutation`, not through the context (D1): they write no token, read no token and change no `status`.

**Two behaviours here are security properties, not UX choices, and a later refactor must not "simplify" them away:**

1. `SignUpScreen` navigates on success **without reading the answer**. The API replies `202` to a free address, to one already registering, and to one that already has an account. A branch here would rebuild the account enumeration the API deliberately removed.
2. `VerifyEmailScreen` renders one message for every code failure. The API answers a single `EMAIL_VERIFICATION_FAILED` for unknown, wrong, expired and attempts-exhausted, and copy that guessed between them would hand back the oracle.

**Files:**
- Modify: `src/modules/auth/validations/credentials.ts` (narrow `signUpSchema`)
- Modify: `src/modules/auth/navigation/types.ts`, `src/modules/auth/navigation/AuthStack.tsx`
- Create: `src/modules/auth/screens/VerifyEmailScreen.tsx`
- Rewrite: `src/modules/auth/screens/SignUpScreen.tsx`
- Modify: `src/modules/auth/screens/SignInScreen.tsx` (one link)
- Modify: `src/modules/auth/hooks/useAuthActions.ts`, `src/modules/auth/types.ts` (remove `signUp`)
- Modify: `src/modules/auth/api/authApi.ts`, `src/modules/auth/api/schemas.ts` (delete `register`, `registerResponseSchema`)
- Test: `src/modules/auth/screens/VerifyEmailScreen.test.tsx` (create); `SignUpScreen.test.tsx` (rewrite); `SignInScreen.test.tsx`, `AuthContext.test.tsx`, `authApi.test.ts` (remove what `signUp`/`register` left behind)

**Interfaces:**
- Consumes: `startSignUp`, `resendVerificationCode` from `../api/authApi`; `confirmSignUp` from `useAuth()`; `confirmSignUpSchema`, `signUpSchema` from `../validations`; `useResendCooldown`, `RESEND_COOLDOWN_SECONDS` from `../hooks/useResendCooldown`; `FIELD_TYPES.CODE`, `.NEW_PASSWORD`.
- Produces: `AuthStackParamList` gains `VerifyEmail: { email?: string } | undefined` and `SignIn: { email?: string } | undefined`. `AuthContextValue` no longer has `signUp`.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/auth/screens/VerifyEmailScreen.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { registerErrorCopy, resetErrorCopy } from '@/errors';
import { API_ERROR_CODES, ApiError } from '@/lib';

import { resendVerificationCode } from '../api/authApi';
import { AUTH_ERROR_COPY } from '../errorCopy';
import { useAuth } from '../hooks/useAuth';
import { VerifyEmailScreen } from './VerifyEmailScreen';

jest.mock('../hooks/useAuth');
jest.mock('../api/authApi');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockResend = resendVerificationCode as jest.MockedFunction<typeof resendVerificationCode>;
const mockConfirmSignUp = jest.fn();

const EMAIL_LABEL = 'Email';
const CODE_LABEL = 'Verification code';
const PASSWORD_LABEL = 'Password';
const CONFIRM_LABEL = 'Confirm password';
const SUBMIT_LABEL = 'Create account';

const VALID_EMAIL = 'user@example.com';
const VALID_CODE = '042317';
const VALID_PASSWORD = 'sup3rS3cret!';
const COOLDOWN_SECONDS = 60;
const ONE_SECOND_MS = 1000;

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  resetErrorCopy();
  registerErrorCopy(AUTH_ERROR_COPY);
  mockUseAuth.mockReturnValue({
    status: 'signedOut',
    user: null,
    signIn: jest.fn(),
    confirmSignUp: mockConfirmSignUp,
    changePassword: jest.fn(),
    signOut: jest.fn(),
    signOutEverywhere: jest.fn(),
    isSubmitting: false,
    isSigningOut: false,
  });
});

const renderScreen = async (params: { email?: string } | undefined = { email: VALID_EMAIL }) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VerifyEmailScreen
        navigation={navigation as never}
        route={{ key: 'k', name: 'VerifyEmail', params } as never}
      />
    </QueryClientProvider>,
  );

const fillAndSubmit = async (code: string, password: string, confirmation = password) => {
  await fireEvent.changeText(screen.getByLabelText(CODE_LABEL), code);
  await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), password);
  await fireEvent.changeText(screen.getByLabelText(CONFIRM_LABEL), confirmation);
  await fireEvent.press(screen.getByText(SUBMIT_LABEL));
};

describe('VerifyEmailScreen', () => {
  it('pre-fills the address the sign-up screen sent, and leaves it editable', async () => {
    // A typo means the code went to someone else's inbox; a read-only field
    // would leave no way back but to restart the flow.
    await renderScreen();

    const input = screen.getByLabelText(EMAIL_LABEL);

    expect(input.props.value).toBe(VALID_EMAIL);
    expect(input.props.editable).not.toBe(false);
  });

  it('opens empty when reached from the "I already have a code" link', async () => {
    await renderScreen(undefined);

    expect(screen.getByLabelText(EMAIL_LABEL).props.value).toBe('');
  });

  it('does not submit a five-digit code', async () => {
    await renderScreen();
    await fillAndSubmit('04231', VALID_PASSWORD);

    expect(mockConfirmSignUp).not.toHaveBeenCalled();
  });

  it('does not submit when the two passwords differ', async () => {
    await renderScreen();
    await fillAndSubmit(VALID_CODE, VALID_PASSWORD, 'sup3rS3cret!!');

    expect(mockConfirmSignUp).not.toHaveBeenCalled();
  });

  it('submits the address, the code and the chosen password', async () => {
    mockConfirmSignUp.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(VALID_CODE, VALID_PASSWORD);

    expect(mockConfirmSignUp).toHaveBeenCalledWith({
      email: VALID_EMAIL,
      code: VALID_CODE,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD,
    });
    // Nothing navigates: RootStack renders one side or the other, so a session
    // unmounts this screen on its own.
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('gives every code failure the same words', async () => {
    mockConfirmSignUp.mockRejectedValue(
      new ApiError({
        status: 422,
        code: API_ERROR_CODES.EMAIL_VERIFICATION_FAILED,
        message: 'never rendered',
      }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_CODE, VALID_PASSWORD);

    expect(
      await screen.findByText('That code is not valid. Request a new one and try again.'),
    ).toBeTruthy();
  });

  it('holds the resend for a minute after arriving from sign-up', async () => {
    jest.useFakeTimers();
    await renderScreen();

    expect(screen.getByText(`Send a new code in ${COOLDOWN_SECONDS}s`)).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(ONE_SECOND_MS * COOLDOWN_SECONDS);
    });

    expect(screen.getByText('Send a new code')).toBeTruthy();
    jest.useRealTimers();
  });

  it('offers the resend at once when no code was just sent', async () => {
    await renderScreen(undefined);

    expect(screen.getByText('Send a new code')).toBeTruthy();
  });

  it('restarts the countdown on a resolved resend, without asking what the API did', async () => {
    // A resend inside the server's own cooldown answers 202 and sends nothing.
    // Both outcomes look identical here, and must.
    jest.useFakeTimers();
    mockResend.mockResolvedValue(undefined);

    await renderScreen(undefined);
    await fireEvent.press(screen.getByText('Send a new code'));

    expect(mockResend).toHaveBeenCalledWith(VALID_EMAIL);
    expect(await screen.findByText(`Send a new code in ${COOLDOWN_SECONDS}s`)).toBeTruthy();
    jest.useRealTimers();
  });
});
```

Note the last test renders with no param, so the email field starts empty — fill it with `VALID_EMAIL` before pressing resend.

Rewrite `src/modules/auth/screens/SignUpScreen.test.tsx` around the new shape — no `useAuth`, a `QueryClientProvider` wrapper, `startSignUp` mocked from `../api/authApi`, and only an email field:

```tsx
describe('SignUpScreen', () => {
  it('does not submit a malformed email', async () => {
    await renderScreen();
    await fillAndSubmit('not-an-email');

    expect(mockStartSignUp).not.toHaveBeenCalled();
  });

  it('sends the address alone and moves to the code screen', async () => {
    mockStartSignUp.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL);

    expect(mockStartSignUp).toHaveBeenCalledWith(VALID_EMAIL);
    expect(navigation.navigate).toHaveBeenCalledWith('VerifyEmail', { email: VALID_EMAIL });
  });

  it('advances for an address that already has an account, exactly as for a free one', async () => {
    // The API answers 202 to both. A branch here would rebuild the account
    // enumeration it deliberately removed.
    mockStartSignUp.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit('taken@example.com');

    expect(navigation.navigate).toHaveBeenCalledWith('VerifyEmail', {
      email: 'taken@example.com',
    });
  });

  it('stays put and reports the failure when the request does not reach the API', async () => {
    mockStartSignUp.mockRejectedValue(
      new ApiError({
        status: 0,
        code: API_ERROR_CODES.NETWORK_ERROR,
        message: 'never rendered',
      }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL);

    expect(
      await screen.findByText('Could not reach the server. Check your connection.'),
    ).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
```

In `SignInScreen.test.tsx`, drop `signUp` from the mocked `useAuth` value, add `confirmSignUp` and `changePassword` as `jest.fn()`, and add:

```tsx
  it('offers a way to the code screen for a sign-up that was interrupted', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('I already have a code'));

    expect(navigation.navigate).toHaveBeenCalledWith('VerifyEmail');
  });
```

In `AuthContext.test.tsx`, delete the `signUp` probe button, its label constant and the `'signs up by registering and then logging in…'` test.

In `authApi.test.ts`, delete the `describe('register')` block and the `register` import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:ci -- src/modules/auth`
Expected: FAIL — `VerifyEmailScreen` does not exist and `SignUpScreen` still renders a password field.

- [ ] **Step 3: Narrow `signUpSchema`**

In `src/modules/auth/validations/credentials.ts`:

```ts
/**
 * Step 1 of sign-up takes the address alone. The password is chosen at
 * confirmation, where the API requires it: the code reaches only the owner of
 * the address, so whoever confirms is whoever chooses the password. Collecting
 * it here would also mean a plaintext password sitting in navigation state
 * until step 3.
 */
export const signUpSchema = z.object({ email: emailSchema });
```

`newPasswordSchema` is no longer imported by this file.

- [ ] **Step 4: Extend the param list and the stack**

A route declared in the param list but registered in no navigator is a
type-level promise `navigate()` will honour at compile time and break at
runtime, so only the route this task actually registers is added here. Task 10
adds its own two.

`src/modules/auth/navigation/types.ts`:

```ts
export type AuthStackParamList = {
  /** `email` pre-fills the form after a password reset, which revoked every session. */
  SignIn: { email?: string } | undefined;
  SignUp: undefined;
  /** `email` present means a code was just sent, which starts the resend countdown. */
  VerifyEmail: { email?: string } | undefined;
};
```

In `AuthStack.tsx`, add `<Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />`.

- [ ] **Step 5: Rewrite `SignUpScreen`**

Email only; no `useAuth`; `useMutation` on `startSignUp` with `networkMode: 'always'`; `FIELDS = ['email'] as const`; on success `navigation.navigate('VerifyEmail', { email })` with the comment about why nothing branches on the answer. `COPY` becomes:

```ts
const COPY = {
  title: 'Create your account',
  subtitle: 'We will email you a six-digit code to confirm this address.',
  emailLabel: 'Email',
  submitLabel: 'Send the code',
  switchToSignIn: 'I already have an account',
} as const;
```

- [ ] **Step 6: Write `VerifyEmailScreen`**

Create `src/modules/auth/screens/VerifyEmailScreen.tsx`. This is the one screen
in the slice that is not a variation on `SignInScreen`, so it is given whole:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';

import { copyForError } from '@/errors';

import { resendVerificationCode } from '../api/authApi';
import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
import { SubmitButton } from '../components/SubmitButton';
import { applyServerFieldErrors } from '../errorCopy';
import { useAuth } from '../hooks/useAuth';
import { RESEND_COOLDOWN_SECONDS, useResendCooldown } from '../hooks/useResendCooldown';
import type { AuthStackParamList } from '../navigation/types';
import { type ConfirmSignUpValues, confirmSignUpSchema } from '../validations';

const COPY = {
  title: 'Confirm your email',
  subtitle: 'Enter the six-digit code we emailed you, and choose a password.',
  emailLabel: 'Email',
  codeLabel: 'Verification code',
  passwordLabel: 'Password',
  confirmPasswordLabel: 'Confirm password',
  passwordHint: 'At least 8 characters, with a letter, a digit and a symbol.',
  submitLabel: 'Create account',
  resendLabel: 'Send a new code',
  backToSignIn: 'Back to sign in',
} as const;

const resendCountdownLabel = (seconds: number) => `${COPY.resendLabel} in ${seconds}s`;

/**
 * Checked against `ConfirmSignUpValues` by `Path<T>`, so a typo is a compile
 * error. `confirmPassword` is absent on purpose: the API has no such field, so
 * it can never appear in a `details[]` entry.
 */
const FIELDS = ['email', 'code', 'password'] as const;

/** No code was just sent, so the resend is available immediately. */
const NO_COOLDOWN = 0;

type VerifyEmailScreenProps = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;

export const VerifyEmailScreen = ({ navigation, route }: VerifyEmailScreenProps) => {
  const { confirmSignUp, isSubmitting } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const { control, getValues, handleSubmit, setError } = useForm<ConfirmSignUpValues>({
    resolver: zodResolver(confirmSignUpSchema),
    // Pre-filled but editable: a typo means the code went to someone else's
    // inbox, and a locked field would leave no way back but to restart.
    defaultValues: {
      email: route.params?.email ?? '',
      code: '',
      password: '',
      confirmPassword: '',
    },
  });

  // Arriving WITH an address means `SignUp` just sent a code, so the cooldown
  // is already running. Arriving from the "I already have a code" link, nothing
  // was sent here and the resend is available at once.
  const { secondsLeft, restart } = useResendCooldown(
    route.params?.email === undefined ? NO_COOLDOWN : RESEND_COOLDOWN_SECONDS,
  );

  const resendMutation = useMutation({
    mutationFn: resendVerificationCode,
    networkMode: 'always',
  });

  const resend = async () => {
    setFormError(null);

    try {
      await resendMutation.mutateAsync(getValues('email'));
      // Restarted once the call RESOLVED, without asking what the API did with
      // it: a resend inside the server's own cooldown answers 202 and sends
      // nothing, indistinguishable from one that worked. A rejection is a
      // different thing — the request failed, which is not a difference the API
      // is hiding — so the button stays available.
      restart();
    } catch (error) {
      setFormError(copyForError(error));
    }
  };

  const submit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      // Nothing navigates on success: `RootStack` renders one side or the
      // other, so opening the session unmounts this screen on its own.
      await confirmSignUp(values);
    } catch (error) {
      applyServerFieldErrors(error, setError, FIELDS);
      setFormError(copyForError(error));
    }
  });

  const isCoolingDown = secondsLeft !== NO_COOLDOWN;

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <Text className="mb-1 text-2xl font-semibold text-content">{COPY.title}</Text>
      <Text className="mb-6 text-sm text-content-muted">{COPY.subtitle}</Text>

      <FormTextField
        control={control}
        label={COPY.emailLabel}
        name="email"
        type={FIELD_TYPES.EMAIL}
      />
      <FormTextField
        control={control}
        label={COPY.codeLabel}
        name="code"
        type={FIELD_TYPES.CODE}
      />
      <FormTextField
        control={control}
        label={COPY.passwordLabel}
        name="password"
        type={FIELD_TYPES.NEW_PASSWORD}
      />
      <FormTextField
        control={control}
        label={COPY.confirmPasswordLabel}
        name="confirmPassword"
        type={FIELD_TYPES.NEW_PASSWORD}
      />
      <Text className="mb-4 text-sm text-content-muted">{COPY.passwordHint}</Text>

      {formError === null ? null : (
        <Text className="mb-4 rounded-lg bg-danger-surface p-3 text-sm text-danger">
          {formError}
        </Text>
      )}

      <SubmitButton isPending={isSubmitting} label={COPY.submitLabel} onPress={submit} />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isCoolingDown || resendMutation.isPending }}
        className="mt-4 items-center"
        disabled={isCoolingDown || resendMutation.isPending}
        onPress={() => {
          void resend();
        }}
      >
        <Text className="text-sm text-primary">
          {isCoolingDown ? resendCountdownLabel(secondsLeft) : COPY.resendLabel}
        </Text>
      </Pressable>

      <Pressable className="mt-4 items-center" onPress={() => navigation.navigate('SignIn')}>
        <Text className="text-sm text-primary">{COPY.backToSignIn}</Text>
      </Pressable>
    </View>
  );
};
```

**The other four screens in Tasks 10 and 11 follow `SignInScreen`'s structure
exactly** — the same imports, the same `useForm` + `zodResolver` setup, the same
`handleSubmit` with `setFormError(null)` then `try`/`catch` calling
`applyServerFieldErrors` and `copyForError`, and the same JSX shape: title,
fields, the conditional error block, `SubmitButton`, then links. What differs
per screen is only its `COPY`, its schema, its `FIELDS` list, its field types,
and what it does on success — all four spelled out where each is written.

- [ ] **Step 7: Add the link on `SignInScreen`**

A second `Pressable` below the existing one, navigating to `VerifyEmail` with no params:

```tsx
      <Pressable className="mt-4 items-center" onPress={() => navigation.navigate('VerifyEmail')}>
        <Text className="text-sm text-primary">{COPY.switchToVerifyEmail}</Text>
      </Pressable>
```

with `switchToVerifyEmail: 'I already have a code'` in `COPY`. Also change `defaultValues` to read `route.params?.email ?? ''` for the email — Task 10's reset flow lands here.

- [ ] **Step 8: Remove `signUp` and the dead register call**

Delete `signUpMutation` from `useAuthActions.ts` (and `signUp` from `AuthActionsValue` and from `isSubmitting`), `signUp` from `AuthContextValue` in `types.ts`, `register` from `authApi.ts`, and `registerResponseSchema` from `schemas.ts`.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm test:ci` then `pnpm check`
Expected: PASS, both.

- [ ] **Step 10: Commit**

```bash
git add src/modules/auth
git commit -m "$(cat <<'MSG'
feat(auth): sign up in three steps, which is what the API now asks for

A conta nasce na confirmação, não no register: o código chega só na caixa
do dono do endereço, então quem confirma é quem escolhe a senha. É isso
que fecha o account pre-hijacking, e o cliente adota a forma em vez de
contorná-la.

Duas propriedades aqui são de segurança, não de UX: SignUp avança sem ler
a resposta (a API responde 202 para endereço livre, em cadastro e com
conta), e VerifyEmail dá uma mensagem só para toda falha de código (a API
responde um código só para desconhecido, errado, expirado e esgotado).

register e registerResponseSchema saem junto com o último chamador.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 10: Password recovery

Two screens, neither of which touches the session (D1, D6). `ForgotPassword` always advances — the API answers `202` whether or not the address has an account, and an address with none receives nothing at all. `ResetPassword` ends at `SignIn`, because the API answers `204` with no tokens and revokes every session of the account, this device included.

The `email` param `ResetPassword` carries is never sent: the API's body is `{ token, newPassword }` and `.strict()`. It exists so the sign-in form the user lands on is already filled in.

**Files:**
- Create: `src/modules/auth/screens/ForgotPasswordScreen.tsx`, `src/modules/auth/screens/ResetPasswordScreen.tsx`
- Modify: `src/modules/auth/navigation/types.ts`, `src/modules/auth/navigation/AuthStack.tsx`, `src/modules/auth/screens/SignInScreen.tsx`
- Test: `ForgotPasswordScreen.test.tsx`, `ResetPasswordScreen.test.tsx` (create); `SignInScreen.test.tsx` (one case)

**Interfaces:**
- Consumes: `requestPasswordReset`, `resetPassword` from `../api/authApi`; `forgotPasswordSchema`, `resetPasswordSchema` from `../validations`; `FIELD_TYPES.TOKEN`, `.NEW_PASSWORD`.
- Produces: `AuthStackParamList` gains `ForgotPassword: undefined` and `ResetPassword: { email: string }`.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/auth/screens/ForgotPasswordScreen.test.tsx`, wrapped in a `QueryClientProvider` and mocking `../api/authApi`:

```tsx
describe('ForgotPasswordScreen', () => {
  it('does not submit a malformed email', async () => {
    await renderScreen();
    await fillAndSubmit('not-an-email');

    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it('sends the address and moves to the reset screen', async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL);

    expect(mockRequestPasswordReset).toHaveBeenCalledWith(VALID_EMAIL);
    expect(navigation.navigate).toHaveBeenCalledWith('ResetPassword', { email: VALID_EMAIL });
  });

  it('advances for an address with no account, exactly as for one with an account', async () => {
    // The API answers 202 to both and emails nothing to the first. A branch
    // here would be an account oracle the API refuses to be.
    mockRequestPasswordReset.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit('nobody@example.com');

    expect(navigation.navigate).toHaveBeenCalledWith('ResetPassword', {
      email: 'nobody@example.com',
    });
  });

  it('reports a rate limit instead of pretending it advanced', async () => {
    mockRequestPasswordReset.mockRejectedValue(
      new ApiError({
        status: 429,
        code: API_ERROR_CODES.TOO_MANY_REQUESTS,
        message: 'never rendered',
      }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL);

    expect(
      await screen.findByText('Too many attempts. Please wait a moment and try again.'),
    ).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
```

Create `src/modules/auth/screens/ResetPasswordScreen.test.tsx`:

```tsx
const VALID_TOKEN = 'Yk9wYVF1ZVRva2VuRXhhbXBsZVZhbHVlMTIzNDU2Nzg5';
const NEW_PASSWORD = 'ev3nS4fer!';

describe('ResetPasswordScreen', () => {
  it('does not submit something that is not a base64url token', async () => {
    await renderScreen();
    await fillAndSubmit('abc', NEW_PASSWORD);

    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('does not submit when the two passwords differ', async () => {
    await renderScreen();
    await fillAndSubmit(VALID_TOKEN, NEW_PASSWORD, 'something else1!');

    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('sends the token and the new password, and nothing else', async () => {
    mockResetPassword.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(VALID_TOKEN, NEW_PASSWORD);

    expect(mockResetPassword).toHaveBeenCalledWith({
      token: VALID_TOKEN,
      newPassword: NEW_PASSWORD,
    });
  });

  it('returns to sign-in with the address filled in, because every session died', async () => {
    mockResetPassword.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(VALID_TOKEN, NEW_PASSWORD);

    expect(navigation.navigate).toHaveBeenCalledWith('SignIn', { email: VALID_EMAIL });
  });

  it('gives every token failure the same words', async () => {
    mockResetPassword.mockRejectedValue(
      new ApiError({
        status: 422,
        code: API_ERROR_CODES.PASSWORD_RESET_FAILED,
        message: 'never rendered',
      }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_TOKEN, NEW_PASSWORD);

    expect(
      await screen.findByText(
        'That token is not valid. Start the recovery again to get a new one.',
      ),
    ).toBeTruthy();
  });
});
```

`renderScreen` passes `route={{ key: 'k', name: 'ResetPassword', params: { email: VALID_EMAIL } } as never}`.

In `SignInScreen.test.tsx`, add:

```tsx
  it('offers a way into password recovery', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Forgot your password?'));

    expect(navigation.navigate).toHaveBeenCalledWith('ForgotPassword');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:ci -- src/modules/auth/screens`
Expected: FAIL — neither screen exists.

- [ ] **Step 3: Write `ForgotPasswordScreen`**

One email field over `forgotPasswordSchema`, `useMutation` on `requestPasswordReset` with `networkMode: 'always'`, `FIELDS = ['email'] as const`, and on success `navigation.navigate('ResetPassword', { email })`.

```ts
const COPY = {
  title: 'Reset your password',
  subtitle:
    'Enter your address and we will email you a token. If the address has no account, nothing is sent.',
  emailLabel: 'Email',
  submitLabel: 'Send the token',
  backToSignIn: 'Back to sign in',
} as const;
```

The subtitle says out loud what the API does, which is why the screen can advance unconditionally without misleading anyone.

- [ ] **Step 4: Write `ResetPasswordScreen`**

Three fields over `resetPasswordSchema` — token (`FIELD_TYPES.TOKEN`), new password and confirmation (`FIELD_TYPES.NEW_PASSWORD`) — `FIELDS = ['token', 'newPassword'] as const`, and on success:

```tsx
      // 204 with no tokens: the API revoked every session of the account, this
      // device included. Signing in again is the only way forward, so the form
      // is handed the address the recovery started from.
      navigation.navigate('SignIn', { email: route.params.email });
```

```ts
const COPY = {
  title: 'Choose a new password',
  subtitle: 'Paste the token from the email, then pick a new password.',
  tokenLabel: 'Reset token',
  newPasswordLabel: 'New password',
  confirmPasswordLabel: 'Confirm password',
  passwordHint: 'At least 8 characters, with a letter, a digit and a symbol.',
  submitLabel: 'Reset password',
  backToSignIn: 'Back to sign in',
} as const;
```

- [ ] **Step 5: Register the two routes**

Add to `AuthStackParamList`:

```ts
  ForgotPassword: undefined;
  /** Carried for the sign-in form afterwards; the reset body itself has no email. */
  ResetPassword: { email: string };
```

and the two `Stack.Screen` entries in `AuthStack.tsx`.

- [ ] **Step 6: Add the recovery link on `SignInScreen`**

`forgotPassword: 'Forgot your password?'` in `COPY`, and a `Pressable` navigating to `ForgotPassword`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test:ci` then `pnpm check`
Expected: PASS, both.

- [ ] **Step 8: Commit**

```bash
git add src/modules/auth
git commit -m "$(cat <<'MSG'
feat(auth): recover a forgotten password

Duas telas, nenhuma delas toca na sessão. ForgotPassword avança sempre —
a API responde 202 com ou sem conta no endereço, e para um endereço sem
conta não manda nada. O subtítulo diz isso em voz alta, que é o que
permite avançar sem enganar ninguém.

ResetPassword termina no SignIn: a API responde 204 sem tokens e revoga
todas as sessões, inclusive a deste aparelho. O e-mail vai junto no
param só para preencher o formulário — o body do reset não tem esse
campo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 11: The account area

`Account` and `ChangePassword` live in the auth module and reach the signed-in shell as a navigator the module exports (D3) — `RootStack` already states the rule: one `Stack.Screen` per module, never per screen.

`HomeScreen` hands its two sign-out actions to `Account` and keeps only a way in. `Account` renders the email and nothing dated: `createdAt` and `emailVerifiedAt` would each need a formatter and a locale decision, and the schema's note that dates stay ISO strings because nothing formats one stays true (D13).

**Files:**
- Create: `src/modules/auth/navigation/AccountStack.tsx`, `src/modules/auth/screens/AccountScreen.tsx`, `src/modules/auth/screens/ChangePasswordScreen.tsx`
- Modify: `src/modules/auth/navigation/types.ts`, `src/modules/auth/index.ts`, `src/navigation/types.ts`, `src/navigation/AppStack.tsx`, `src/screens/HomeScreen.tsx`
- Test: `AccountScreen.test.tsx`, `ChangePasswordScreen.test.tsx` (create); `src/screens/HomeScreen.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `useAuth()` for `user`, `changePassword`, `signOut`, `signOutEverywhere`, `isSigningOut`, `isSubmitting`; `changePasswordSchema` from `../validations`.
- Produces: `AccountStack` and `AccountStackParamList` from `src/modules/auth/index.ts`; `AppStackParamList` gains `Account: NavigatorScreenParams<AccountStackParamList>`.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/auth/screens/ChangePasswordScreen.test.tsx`, mocking `../hooks/useAuth`:

```tsx
describe('ChangePasswordScreen', () => {
  it('does not submit a new password that fails the policy', async () => {
    await renderScreen();
    await fillAndSubmit(CURRENT_PASSWORD, 'password', 'password');

    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('does not submit when the confirmation does not match', async () => {
    await renderScreen();
    await fillAndSubmit(CURRENT_PASSWORD, NEW_PASSWORD, CURRENT_PASSWORD);

    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('submits both passwords and goes back once it succeeds', async () => {
    mockChangePassword.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);

    expect(mockChangePassword).toHaveBeenCalledWith({
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('names the current password as the thing that was wrong', async () => {
    mockChangePassword.mockRejectedValue(
      new ApiError({
        status: 422,
        code: API_ERROR_CODES.INVALID_CURRENT_PASSWORD,
        message: 'never rendered',
      }),
    );

    await renderScreen();
    await fillAndSubmit(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);

    expect(await screen.findByText('That is not your current password.')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('says the new password has to differ from the old one', async () => {
    mockChangePassword.mockRejectedValue(
      new ApiError({
        status: 422,
        code: API_ERROR_CODES.PASSWORD_UNCHANGED,
        message: 'never rendered',
      }),
    );

    await renderScreen();
    await fillAndSubmit(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);

    expect(
      await screen.findByText('Choose a password different from your current one.'),
    ).toBeTruthy();
  });
});
```

Create `src/modules/auth/screens/AccountScreen.test.tsx`:

```tsx
describe('AccountScreen', () => {
  it('shows the address of the signed-in account', async () => {
    await renderScreen();

    expect(screen.getByText(VALID_EMAIL)).toBeTruthy();
  });

  it('opens the password screen', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Change password'));

    expect(navigation.navigate).toHaveBeenCalledWith('ChangePassword');
  });

  it('signs out on this device', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Sign out'));

    expect(mockSignOut).toHaveBeenCalled();
  });

  it('asks before ending every session, since it cannot be undone', async () => {
    const alert = jest.spyOn(Alert, 'alert');

    await renderScreen();
    await fireEvent.press(screen.getByText('Sign out everywhere'));

    expect(alert).toHaveBeenCalled();
    expect(mockSignOutEverywhere).not.toHaveBeenCalled();
  });
});
```

Rewrite `src/screens/HomeScreen.test.tsx` to assert the screen renders its title and navigates to `Account`, with the sign-out assertions deleted — they moved.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:ci -- src/modules/auth/screens src/screens`
Expected: FAIL — neither screen exists.

- [ ] **Step 3: Write `ChangePasswordScreen`**

Three fields over `changePasswordSchema` — current (`FIELD_TYPES.PASSWORD`), new and confirmation (`FIELD_TYPES.NEW_PASSWORD`) — `FIELDS = ['currentPassword', 'newPassword'] as const`, submit through `useAuth().changePassword`, `isPending` from `useAuth().isSubmitting`, and `navigation.goBack()` on success.

```ts
const COPY = {
  title: 'Change your password',
  subtitle: 'Every other device will be signed out. This one stays signed in.',
  currentPasswordLabel: 'Current password',
  newPasswordLabel: 'New password',
  confirmPasswordLabel: 'Confirm password',
  passwordHint: 'At least 8 characters, with a letter, a digit and a symbol.',
  submitLabel: 'Change password',
} as const;
```

The subtitle is the honest description of what the API does, and it is what makes `goBack()` on success enough: nothing surprising happened to this device.

- [ ] **Step 4: Write `AccountScreen`**

`user?.email` from `useAuth()`, a `Pressable` to `ChangePassword`, and the two sign-out actions moved verbatim from `HomeScreen` — the `Alert.alert` confirmation, the `void signOut()` with its "cannot reject by construction" comment, and the `void signOutEverywhere().catch(showError)` with its "rejects on failure and keeps the session" comment. Both comments move with the code they explain.

```ts
const COPY = {
  title: 'Account',
  emailLabel: 'Signed in as',
  changePasswordLabel: 'Change password',
  signOutLabel: 'Sign out',
  signOutEverywhereLabel: 'Sign out everywhere',
  confirmTitle: 'Sign out everywhere?',
  confirmMessage: 'Every device signed in to this account will be signed out.',
  confirmLabel: 'Sign out',
  cancelLabel: 'Cancel',
} as const;
```

- [ ] **Step 5: Write `AccountStack` and extend the param lists**

`src/modules/auth/navigation/types.ts`:

```ts
export type AccountStackParamList = {
  Account: undefined;
  ChangePassword: undefined;
};
```

`src/modules/auth/navigation/AccountStack.tsx` mirrors `AuthStack`, but with the header visible — it is a pushed flow inside the signed-in shell, and the header is what gives the user the way back:

```tsx
const SCREEN_TITLES = {
  account: 'Account',
  changePassword: 'Change password',
} as const;

export const AccountStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="Account"
      component={AccountScreen}
      options={{ title: SCREEN_TITLES.account }}
    />
    <Stack.Screen
      name="ChangePassword"
      component={ChangePasswordScreen}
      options={{ title: SCREEN_TITLES.changePassword }}
    />
  </Stack.Navigator>
);
```

Export `AccountStack` and `AccountStackParamList` from `src/modules/auth/index.ts`.

- [ ] **Step 6: Register it in the app shell**

`src/navigation/types.ts`:

```ts
export type AppStackParamList = {
  Home: undefined;
  /**
   * The auth module's own navigator, registered as one screen — a module's
   * internals stop at its navigator, exactly as `RootStack` does.
   */
  Account: NavigatorScreenParams<AccountStackParamList>;
};
```

`src/navigation/AppStack.tsx` registers it with `options={{ headerShown: false }}`, so the inner stack owns the header rather than nesting two.

- [ ] **Step 7: Reduce `HomeScreen`**

Delete both sign-out buttons, `useAuth`, `useErrorToast`, `Alert` and `confirmSignOutEverywhere`. What stays is the title and a `Pressable` navigating to `Account`. `HomeScreen` takes `NativeStackScreenProps<AppStackParamList, 'Home'>` for the typed `navigation`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test:ci` then `pnpm check`
Expected: PASS, both.

- [ ] **Step 9: Commit**

```bash
git add src/modules/auth src/navigation src/screens
git commit -m "$(cat <<'MSG'
feat(auth): an account area, with the password change in it

Account e ChangePassword moram no módulo auth e chegam à casca logada
como um navigator que o módulo exporta — o RootStack já escreve a regra:
um Stack.Screen por módulo, nunca por tela.

A Home entrega os dois logouts para a Account e fica só com o caminho
até lá. A Account mostra o e-mail e nada com data: createdAt e
emailVerifiedAt exigiriam um formatador e uma decisão de locale cada.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 12: Documentation

The prose that describes behaviour rather than exports, collected at the end so it describes what actually shipped. Every module README is written in **Portuguese prose with English identifiers** — the one carve-out from the English-only rule.

**Files:**
- Modify: `src/modules/auth/README.md`, `src/navigation/README.md`, `src/lib/README.md`, `src/errors/README.md`, `src/screens/README.md`

- [ ] **Step 1: Rewrite `src/modules/auth/README.md`**

The Conventions section currently describes a sign-up that no longer exists ("Cadastro faz login em seguida", `201 { id }`). Delete that bullet and add these, in the file's existing voice:

- **O cadastro tem três passos e a conta nasce no terceiro.** `register` só guarda um cadastro pendente e manda um código; `email/verify` cria a conta com a senha daquele request e abre a sessão. A senha entra no passo 3 porque o código só chega na caixa do dono do endereço — é isso que fecha o *account pre-hijacking*.
- **`register` e `password/forgot` respondem `202` sempre, e as telas não ramificam.** Endereço livre, cadastro em andamento e conta existente são indistinguíveis por resposta; qualquer condicional na tela reconstrói a enumeração de contas que a API removeu de propósito.
- **Verificação e reset têm uma mensagem só cada.** A API responde um código só para desconhecido, errado, expirado e esgotado. Texto que adivinhasse entre eles devolveria o oráculo que ela recusou.
- **O que passa pelo `AuthContext` é o que mexe na sessão.** `signIn`, `confirmSignUp`, `changePassword`, `signOut` e `signOutEverywhere`. `startSignUp`, `resendVerificationCode`, `requestPasswordReset` e `resetPassword` não escrevem nem leem token: são `useMutation` na própria tela.
- **`changePassword` grava o token novo e mantém a sessão.** A API revoga as outras sessões e devolve um par novo para este aparelho; não gravar deslogaria este aparelho no refresh seguinte.
- **O contador de reenvio reinicia numa chamada que resolveu, sem perguntar o que a API fez.** Reenvio dentro do cooldown do servidor responde `202` e não manda nada — indistinguível de um que funcionou.
- **`EMAIL_NOT_VERIFIED` não leva a lugar nenhum.** Conta existente e não verificada não tem cadastro pendente, então `resend` não acharia nada e `confirm` não teria como passar. Só copy.
- **A área de conta é um navigator próprio.** `AccountStack` sai do módulo e entra no `AppStack` como uma tela só — o interno do módulo para no navigator dele.

Update the Components, Hooks, Constants and Types tables: `AccountStack` joins `AuthStack`; `useAuth()` gains `confirmSignUp` and `changePassword` and loses `signUp`; `AccountStackParamList` joins the types; the `AuthStackParamList` row lists all five routes.

- [ ] **Step 2: Update the four other READMEs**

- `src/navigation/README.md` — the `Account` route and why it is one entry for a whole module navigator.
- `src/lib/README.md` — the six codes added and the one removed, with the reason `EMAIL_ALREADY_IN_USE` cannot arrive.
- `src/errors/README.md` — `TOO_MANY_REQUESTS` in the base copy, and that `classify.ts` deliberately did not change.
- `src/screens/README.md` — `HomeScreen` no longer signs anyone out.

- [ ] **Step 3: Verify and commit**

Run: `pnpm check` and `pnpm test:ci`
Expected: PASS, both.

```bash
git add src/modules/auth/README.md src/navigation/README.md src/lib/README.md src/errors/README.md src/screens/README.md
git commit -m "$(cat <<'MSG'
docs: record what the verification and recovery slice changed

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Verification

Runnable here, after every task: `pnpm check` and `pnpm test:ci`.

Not runnable here: WSL2 has no Xcode, Android SDK or Maestro CLI, and the API needs Postgres and a mail sink. Every flow is exercised against fakes in Jest. Against a live `api-clean-platform`, four things a fake cannot prove:

1. `register` with an address that already has an account still lands on `VerifyEmail` — and that inbox receives the "someone tried to register" notice rather than a code.
2. A code entered after five wrong guesses fails with the same message as a typo, with no wording difference.
3. `changePassword` on device A signs device B out within the access token's TTL, not instantly — the API keeps the database off the authenticated path.
4. `reset` revokes the session on the device that ran it too: the app lands on `SignIn`, not on a signed-in screen holding a dead token.
