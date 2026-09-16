# Generic form inputs

**Date:** 2026-09-15
**Status:** Approved

## Goal

Every app cloned from this boilerplate will have text, email, password and
verification-code inputs — that is not speculative reuse, it is the one thing
guaranteed about any app built on this template. Today those inputs exist only
as `FormTextField` inside `src/modules/auth/components/`, coupled to
react-hook-form and reachable only from the one module that owns it.

Move the input primitives to `src/components/`, split by concern (pure UI vs.
the react-hook-form integration), and migrate `auth` to use them — proving the
design against a real module instead of leaving it untested until a second app
needs it.

## Scope

In:

- Four pure UI primitives — `TextInput`, `EmailInput`, `PasswordInput`,
  `CodeInput` — under `src/components/inputs/`, with no react-hook-form
  dependency.
- One integration component, `FormField`, under `src/components/forms/`,
  binding a react-hook-form `Controller` to whichever primitive its `type`
  selects.
- Migrating all six `auth` screens to `FormField`, deleting `FormTextField`.
- Documenting the exception this creates to the module-boundary rule.

Out: `SubmitButton` (still single-consumer, no forcing function to move it
yet — see D1), any input type beyond the five `FormTextField` already covers
(no phone, no multiline, no select).

## Decisions

### D1 — A named exception to the "second consumer" rule

`AGENTS.md` Rule 5 and `ARCHITECTURE.md` §2 currently say a component leaves
its module for `src/components/` only once a second module needs it — read
literally, that blocks this change, since `auth` is still the only module in
this repo.

The rule's purpose is to stop speculative promotion — moving code toward a
consumer that might never arrive. Text/email/password/code inputs are not
speculative for a boilerplate: every app cloned from this repo is guaranteed
to have them, the same way `react-hook-form` and `zod` are already listed as
core stack rather than an `auth`-specific dependency. The "second consumer" is
the next app, not the next module in this repo.

`SubmitButton` stays in `auth/components/` under the unchanged rule — it has
no comparable "every app needs a button styled exactly like this" argument,
and moving it now would be exactly the speculation the rule exists to block.
It's a reasonable future candidate under this same exception, not something
this change touches.

Both documents get the exception spelled out (see Documentation), so the next
person reading them sees a documented decision, not an apparent violation.

### D2 — Primitives are pure; react-hook-form lives in one separate wrapper

`inputs/` components take `value`/`onChangeText`/`error`/`label` — no
`control`, no `Controller`, importable by any app regardless of its form
library, or with no form library at all.

`FormField` is the only place that imports `react-hook-form`. This is a
deliberate two-layer split, not extra ceremony: a primitive with an RHF
dependency baked in cannot be reused by a screen that manages its own state
(e.g. a live-search box with no form around it), and every consumer of
`FormField` today is already inside a `react-hook-form` form.

### D3 — Five types collapse to four primitives, not five

`FormTextField` has five `FIELD_TYPES` today: `email`, `password`,
`newPassword`, `code`, `token`.

- `newPassword` does not get its own component. The only difference from
  `password` is `autoComplete` (`new-password` vs. `current-password`) — same
  UI, same behaviour otherwise. `PasswordInput` takes a
  `variant: 'current' | 'new'` prop instead of forking into two files.
- `token` does not get a component at all. A reset token is not a concept
  every app has, unlike email/password/code. `FormField` gets a `type: 'text'`
  case — a bare `TextInput` — and an `inputProps` escape hatch (D5) so
  `ResetPasswordScreen` can still set `autoCapitalize="none"`,
  `autoComplete="off"` and `autoCorrect={false}` without a dedicated
  component existing for a single call site.

### D4 — `FormField` is promoted too, not left inside `auth`

The same "known multi-app" argument from D1 applies to the react-hook-form
integration layer, not only to the visual primitives: `react-hook-form` +
`zod` is core stack (`ARCHITECTURE.md`'s stack line lists it before any
module exists), so any future module with a form needs exactly this
dispatch-by-`type` wrapper, not a reason to reinvent it per module.

### D5 — `FormField`'s escape hatch

```ts
interface FormFieldProps<TValues extends FieldValues> {
  control: Control<TValues>;
  name: Path<TValues>;
  label: string;
  type: FormFieldType;
  digits?: number;              // required in practice when type === 'code'
  inputProps?: Record<string, unknown>; // passthrough to the rendered primitive
}
```

`digits` only makes sense for `code` — the implementation should express that
with a discriminated union on `type` if it can be done without contorting the
call sites, and fall back to a documented runtime assumption (default to the
existing `VERIFICATION_CODE_DIGITS`-shaped constant, but caller-supplied) if
not; this is an implementation-time call, not one this spec locks.

`inputProps` is the one general-purpose override, used today only by the
token field. It is not a way to bypass `type` for the common cases — a second
call site reaching for it for anything other than a one-off native prop is a
signal that `type` needs a new case, not that `inputProps` should grow.

## Design

### 1. `src/components/inputs/TextInput.tsx`

The base primitive — label, `View` wrapper, `RNTextInput`, error text below,
same visual structure `FormTextField` already renders today (NativeWind
classes carried over unchanged: `rounded-lg border border-border bg-surface
px-3 py-3 text-base text-content` for the field, `text-sm text-danger` for the
error). Accepts `value`, `onChangeText`, `onBlur`, `error?: string`, `label`,
`className?`, and passes through any other native `TextInput` prop
(`keyboardType`, `autoCapitalize`, `autoComplete`, `autoCorrect`,
`secureTextEntry`, `maxLength`) so the three wrappers below can fix them.

```ts
interface TextInputProps extends Omit<RNTextInputProps, 'value' | 'onChangeText'> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
}
```

### 2. `src/components/inputs/EmailInput.tsx`

Fixes `keyboardType="email-address"`, `autoCapitalize="none"`,
`autoComplete="email"`, `autoCorrect={false}`, `secureTextEntry={false}` —
identical to today's `FIELD_TYPES.EMAIL` entry in `INPUT_PROPS_BY_TYPE`.

### 3. `src/components/inputs/PasswordInput.tsx`

```ts
export const PASSWORD_VARIANTS = { CURRENT: 'current', NEW: 'new' } as const;
export type PasswordVariant = (typeof PASSWORD_VARIANTS)[keyof typeof PASSWORD_VARIANTS];

interface PasswordInputProps extends Omit<TextInputProps, 'keyboardType' | 'autoCapitalize' | 'autoComplete' | 'autoCorrect' | 'secureTextEntry'> {
  variant?: PasswordVariant; // defaults to 'current'
}
```

`secureTextEntry={true}` always; `autoComplete` is `new-password` for
`'new'`, `current-password` otherwise — the comment explaining *why*
`new-password` triggers the platform's generate-and-store behaviour moves
here from `FormTextField`.

### 4. `src/components/inputs/CodeInput.tsx`

```ts
interface CodeInputProps extends Omit<TextInputProps, 'keyboardType' | 'autoCapitalize' | 'autoComplete' | 'autoCorrect' | 'secureTextEntry' | 'maxLength'> {
  digits: number;
}
```

Fixes `keyboardType="number-pad"`, `autoComplete="one-time-code"`,
`secureTextEntry={false}`; `maxLength={digits}`. The comment about the keypad
stopping a seventh digit rather than letting the user find out at submit moves
here too.

### 5. `src/components/forms/FormField.tsx`

```ts
export const FORM_FIELD_TYPES = {
  TEXT: 'text',
  EMAIL: 'email',
  PASSWORD: 'password',
  NEW_PASSWORD: 'newPassword',
  CODE: 'code',
} as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[keyof typeof FORM_FIELD_TYPES];
```

`Controller` renders one of `TextInput`/`EmailInput`/`PasswordInput` (with the
right `variant`)/`CodeInput` (with `digits`) based on `type`, wiring
`onBlur`/`onChange`/`value` from the field and `error?.message` from
`fieldState`. Whether the dispatch is a `switch` or a lookup map is an
implementation detail — the primitives don't share a uniform prop shape
(`CodeInput` needs `digits`, `PasswordInput` needs `variant`), so forcing a
single `Record<Type, Component>` map may cost more than it saves; decide
during implementation, not here.

### 6. `src/modules/auth` after the change

- `FormTextField.tsx` and `FormTextField.test.tsx` are deleted.
- All six screens (`SignIn`, `SignUp`, `ForgotPassword`, `ResetPassword`,
  `ChangePassword`, `VerifyEmail`) import `FormField`/`FORM_FIELD_TYPES` from
  `@/components` instead of `FormTextField`/`FIELD_TYPES` from
  `../components/FormTextField`.
- `VerifyEmailScreen`'s code field passes `digits={VERIFICATION_CODE_DIGITS}`
  (the constant stays in `validations/`, only its consumer changes).
- `ResetPasswordScreen`'s token field becomes `type={FORM_FIELD_TYPES.TEXT}`
  with `inputProps={{ autoCapitalize: 'none', autoComplete: 'off', autoCorrect: false }}`.
- `SubmitButton.tsx` is untouched (D1).

### 7. `src/components/index.ts`

Exports `TextInput`, `EmailInput`, `PasswordInput`, `PASSWORD_VARIANTS`,
`CodeInput`, `FormField`, `FORM_FIELD_TYPES`, and their prop types. This is the
module's first real export — today it's `export {};`.

## Testing

| File | What it proves |
|---|---|
| `TextInput.test.tsx` | renders label/value, fires `onChangeText`, shows `error` when present and nothing when absent |
| `EmailInput.test.tsx` | fixed keyboard/autoComplete config, same assertions style as today's `FormTextField.test.tsx` |
| `PasswordInput.test.tsx` | `secureTextEntry` always true; `autoComplete` flips on `variant` |
| `CodeInput.test.tsx` | numeric keypad, `one-time-code`, `maxLength` equals the given `digits` |
| `FormField.test.tsx` | same `Host`-with-`useForm` pattern as today's `FormTextField.test.tsx`; one case per `type`, plus `inputProps` passthrough |

The six auth screen test files need no behavioural changes — they assert on
rendered text/labels/accessibility state, which `FormField` preserves. They
only need their `FormTextField`-specific mocks/imports (there are none beyond
the component import itself) checked for staleness.

## Documentation

- `AGENTS.md` Rule 5 — add the exception from D1, one short paragraph, with
  `SubmitButton` named as the contrasting non-example.
- `ARCHITECTURE.md` §2 tree — `src/components/` gains `inputs/` and `forms/`
  with their files; `modules/auth/components/` loses `FormTextField.tsx`. The
  "regra de fronteira entre módulos" section gains the same exception,
  cross-referenced to Rule 5.
- `src/components/README.md` — out of "vazio por enquanto"; full export
  tables for both subfolders, plus a short note on why two subfolders exist
  from day one instead of starting flat (D1/D2 reasoning, condensed).
- `src/modules/auth/README.md` — `FormTextField` removed from the Components
  table (it no longer exists); note that field rendering now comes from
  `@/components`.

## Delivery slices

1. `TextInput` + test.
2. `EmailInput`, `PasswordInput`, `CodeInput` + tests.
3. `FormField` + test.
4. Migrate the six auth screens; delete `FormTextField`
   (+`.test.tsx`); update `src/components/index.ts`.
5. Documentation (`AGENTS.md`, `ARCHITECTURE.md`, both READMEs).

## Verification

`pnpm check` and `npx jest --ci --forceExit` after every slice — the full
suite, since slice 4 touches six existing screen test files at once and a
per-file run would miss a cross-file regression.

## Out of scope / explicitly deferred

`SubmitButton` promotion (D1) · phone/multiline/select input primitives ·
moving any other `auth`-only component · a design-token/Storybook-style
catalogue of the new primitives.
