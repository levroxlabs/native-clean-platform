# Generic Form Inputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the input primitives behind `auth`'s `FormTextField` into
`src/components/` — split into pure UI primitives (`inputs/`) and a
react-hook-form integration layer (`forms/`) — and migrate the `auth` module
to use them, deleting `FormTextField`.

**Architecture:** Four presentational components (`TextInput`, `EmailInput`,
`PasswordInput`, `CodeInput`) with no react-hook-form dependency, each
wrapping the previous one. One `FormField` component owns the only
`Controller`/react-hook-form import and dispatches to the right primitive by
a `type` prop. Both subfolders are new top-level exports of
`src/components/index.ts`.

**Tech Stack:** React Native, NativeWind v4, react-hook-form 7, TypeScript,
Jest (jest-expo) + React Native Testing Library, Biome.

**Spec:** `docs/superpowers/specs/2026-09-15-generic-form-inputs-design.md`
— read it alongside this plan; the "why" behind every decision below (D1–D6)
lives there, not repeated here.

## Global Constraints

- Every component and function is an arrow function assigned to a `const` —
  never `function` (Rule 2).
- Closed sets are a `const` object with `as const` plus a derived union type,
  never a TS `enum` (Rule 4). **Exception (D6, already applied to
  `AGENTS.md`):** a prop already typed with its own derived union —
  `FormField`'s `type`, `PasswordInput`'s `variant` — is passed as a
  **literal** at call sites (`type="password"`), not via the constant. The
  constant still exists, for reading the value back inside the component that
  owns it.
- User-facing copy (labels) still comes from a `COPY` object per screen —
  D6 does not touch this; copy has no `tsc`-enforced union protecting it.
- NativeWind classes only, no `StyleSheet.create`. Every component under
  `src/components/` accepts `className`, merged with its own classes via
  `cn()` from `@/utils` (`src/components/README.md`'s existing convention).
- Tests are colocated, `.test.ts`/`.test.tsx` suffix, never a snapshot test.
  `render`, `fireEvent.*`, and `renderHook` all return Promises in this
  installed RNTL version — always `await` them.
- English only in code, comments, and identifiers. README prose is
  Portuguese (Rule 1).
- Every `if`/`else` uses a block body (Rule 12).
- `async`/`await` only, never `.then()`/`.catch()` (Rule 11).
- `pnpm check` runs `tsc --noEmit` then `biome check .`. Verify a single test
  file with `npx jest --ci --forceExit <path>` — a bare `jest <path>` with no
  `--forceExit` is known to hang in this repo.
- The `@/` alias points at `src/`; never write `../../`.
- Nothing outside `src/components/` imports a file inside it — only what
  `src/components/index.ts` exports. Files inside `src/components/` may
  import each other directly across the `inputs/`/`forms/` subfolders (the
  same intra-folder pattern already used by `src/lib/api/`).

---

### Task 1: `TextInput` — the base primitive

**Files:**
- Create: `src/components/inputs/TextInput.tsx`
- Create: `src/components/inputs/TextInput.test.tsx`
- Modify: `src/components/index.ts`

**Interfaces:**
- Produces: `TextInput` (component), `TextInputProps` (interface: `label:
  string`, `value: string`, `onChangeText: (value: string) => void`, `error?:
  string`, plus every native `TextInput` prop except `value`/`onChangeText`),
  both exported from `src/components/inputs/TextInput.tsx` and re-exported
  from `src/components/index.ts`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/inputs/TextInput.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { TextInput } from './TextInput';

const LABEL = 'Field under test';

describe('TextInput', () => {
  it('renders the label and the current value', async () => {
    await render(<TextInput label={LABEL} onChangeText={jest.fn()} value="hello" />);

    expect(screen.getByText(LABEL)).toBeTruthy();
    expect(screen.getByLabelText(LABEL).props.value).toBe('hello');
  });

  it('fires onChangeText with what the user typed', async () => {
    const handleChangeText = jest.fn();
    await render(<TextInput label={LABEL} onChangeText={handleChangeText} value="" />);

    await fireEvent.changeText(screen.getByLabelText(LABEL), 'typed value');

    expect(handleChangeText).toHaveBeenCalledWith('typed value');
  });

  it('shows the error message when one is given', async () => {
    await render(<TextInput error="Required" label={LABEL} onChangeText={jest.fn()} value="" />);

    expect(screen.getByText('Required')).toBeTruthy();
  });

  it('shows no error text when none is given', async () => {
    await render(<TextInput label={LABEL} onChangeText={jest.fn()} value="" />);

    expect(screen.queryByText('Required')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --ci --forceExit src/components/inputs/TextInput.test.tsx`
Expected: FAIL — `Cannot find module './TextInput'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/inputs/TextInput.tsx
import {
  Text,
  TextInput as NativeTextInput,
  type TextInputProps as NativeTextInputProps,
  View,
} from 'react-native';

import { cn } from '@/utils';

export interface TextInputProps extends Omit<NativeTextInputProps, 'value' | 'onChangeText'> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
}

export const TextInput = ({
  label,
  value,
  onChangeText,
  error,
  className,
  ...inputProps
}: TextInputProps) => (
  <View className="mb-4">
    <Text className="mb-1 text-sm font-medium text-content">{label}</Text>
    <NativeTextInput
      accessibilityLabel={label}
      className={cn(
        'rounded-lg border border-border bg-surface px-3 py-3 text-base text-content',
        className,
      )}
      onChangeText={onChangeText}
      value={value}
      {...inputProps}
    />
    {error === undefined ? null : <Text className="mt-1 text-sm text-danger">{error}</Text>}
  </View>
);
```

- [ ] **Step 4: Export it from the barrel**

```ts
// src/components/index.ts — replace the file's only line, `export {};`
export { TextInput, type TextInputProps } from './inputs/TextInput';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --ci --forceExit src/components/inputs/TextInput.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Verify the whole repo is still clean**

Run: `pnpm check`
Expected: PASS (`tsc --noEmit` then `biome check .`, no errors).

- [ ] **Step 7: Commit**

```bash
git add src/components/inputs/TextInput.tsx src/components/inputs/TextInput.test.tsx src/components/index.ts
git commit -m "feat(components): add TextInput primitive"
```

---

### Task 2: `EmailInput`

**Files:**
- Create: `src/components/inputs/EmailInput.tsx`
- Create: `src/components/inputs/EmailInput.test.tsx`
- Modify: `src/components/index.ts`

**Interfaces:**
- Consumes: `TextInput`, `TextInputProps` from
  `src/components/inputs/TextInput.tsx` (Task 1).
- Produces: `EmailInput` (component), re-exported from
  `src/components/index.ts`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/inputs/EmailInput.test.tsx
import { render, screen } from '@testing-library/react-native';

import { EmailInput } from './EmailInput';

const LABEL = 'Email';

describe('EmailInput', () => {
  it('configures the keyboard and autofill for an email address', async () => {
    await render(<EmailInput label={LABEL} onChangeText={jest.fn()} value="" />);

    const input = screen.getByLabelText(LABEL);

    expect(input.props.keyboardType).toBe('email-address');
    expect(input.props.autoComplete).toBe('email');
    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.secureTextEntry).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --ci --forceExit src/components/inputs/EmailInput.test.tsx`
Expected: FAIL — `Cannot find module './EmailInput'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/inputs/EmailInput.tsx
import { TextInput, type TextInputProps } from './TextInput';

type EmailInputProps = Omit<
  TextInputProps,
  'autoCapitalize' | 'autoComplete' | 'autoCorrect' | 'keyboardType' | 'secureTextEntry'
>;

export const EmailInput = (props: EmailInputProps) => (
  <TextInput
    {...props}
    autoCapitalize="none"
    autoComplete="email"
    autoCorrect={false}
    keyboardType="email-address"
    secureTextEntry={false}
  />
);
```

- [ ] **Step 4: Export it from the barrel**

```ts
// src/components/index.ts — add this line
export { EmailInput } from './inputs/EmailInput';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --ci --forceExit src/components/inputs/EmailInput.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 6: Verify the whole repo is still clean**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/inputs/EmailInput.tsx src/components/inputs/EmailInput.test.tsx src/components/index.ts
git commit -m "feat(components): add EmailInput primitive"
```

---

### Task 3: `PasswordInput`

**Files:**
- Create: `src/components/inputs/PasswordInput.tsx`
- Create: `src/components/inputs/PasswordInput.test.tsx`
- Modify: `src/components/index.ts`

**Interfaces:**
- Consumes: `TextInput`, `TextInputProps` from
  `src/components/inputs/TextInput.tsx` (Task 1).
- Produces: `PasswordInput` (component), `PASSWORD_VARIANTS` (`{ CURRENT:
  'current', NEW: 'new' } as const`), `PasswordVariant` (the derived union),
  re-exported from `src/components/index.ts`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/inputs/PasswordInput.test.tsx
import { render, screen } from '@testing-library/react-native';

import { PasswordInput } from './PasswordInput';

const LABEL = 'Password';

describe('PasswordInput', () => {
  it('hides the input and offers to fill the current password by default', async () => {
    await render(<PasswordInput label={LABEL} onChangeText={jest.fn()} value="" />);

    const input = screen.getByLabelText(LABEL);

    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.autoComplete).toBe('current-password');
  });

  it('asks the password manager to generate rather than to fill a new password', async () => {
    await render(<PasswordInput label={LABEL} onChangeText={jest.fn()} value="" variant="new" />);

    expect(screen.getByLabelText(LABEL).props.autoComplete).toBe('new-password');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --ci --forceExit src/components/inputs/PasswordInput.test.tsx`
Expected: FAIL — `Cannot find module './PasswordInput'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/inputs/PasswordInput.tsx
import { TextInput, type TextInputProps } from './TextInput';

export const PASSWORD_VARIANTS = { CURRENT: 'current', NEW: 'new' } as const;

export type PasswordVariant = (typeof PASSWORD_VARIANTS)[keyof typeof PASSWORD_VARIANTS];

// `new-password`, not `current-password`: this is what makes the platform
// password manager offer to generate and store one instead of filling the
// old one back in.
const AUTO_COMPLETE_BY_VARIANT: Record<PasswordVariant, TextInputProps['autoComplete']> = {
  [PASSWORD_VARIANTS.CURRENT]: 'current-password',
  [PASSWORD_VARIANTS.NEW]: 'new-password',
};

interface PasswordInputProps
  extends Omit<
    TextInputProps,
    'autoCapitalize' | 'autoComplete' | 'autoCorrect' | 'keyboardType' | 'secureTextEntry'
  > {
  variant?: PasswordVariant;
}

export const PasswordInput = ({
  variant = PASSWORD_VARIANTS.CURRENT,
  ...props
}: PasswordInputProps) => (
  <TextInput
    {...props}
    autoCapitalize="none"
    autoComplete={AUTO_COMPLETE_BY_VARIANT[variant]}
    autoCorrect={false}
    keyboardType="default"
    secureTextEntry={true}
  />
);
```

- [ ] **Step 4: Export it from the barrel**

```ts
// src/components/index.ts — add this line
export { PASSWORD_VARIANTS, PasswordInput, type PasswordVariant } from './inputs/PasswordInput';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --ci --forceExit src/components/inputs/PasswordInput.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 6: Verify the whole repo is still clean**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/inputs/PasswordInput.tsx src/components/inputs/PasswordInput.test.tsx src/components/index.ts
git commit -m "feat(components): add PasswordInput primitive"
```

---

### Task 4: `CodeInput`

**Files:**
- Create: `src/components/inputs/CodeInput.tsx`
- Create: `src/components/inputs/CodeInput.test.tsx`
- Modify: `src/components/index.ts`

**Interfaces:**
- Consumes: `TextInput`, `TextInputProps` from
  `src/components/inputs/TextInput.tsx` (Task 1).
- Produces: `CodeInput` (component, requires a `digits: number` prop),
  re-exported from `src/components/index.ts`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/inputs/CodeInput.test.tsx
import { render, screen } from '@testing-library/react-native';

import { CodeInput } from './CodeInput';

const LABEL = 'Verification code';
const DIGITS = 6;

describe('CodeInput', () => {
  it('gives a code a numeric keypad, the one-time-code hint and a matching max length', async () => {
    await render(<CodeInput digits={DIGITS} label={LABEL} onChangeText={jest.fn()} value="" />);

    const input = screen.getByLabelText(LABEL);

    expect(input.props.keyboardType).toBe('number-pad');
    expect(input.props.autoComplete).toBe('one-time-code');
    expect(input.props.maxLength).toBe(DIGITS);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --ci --forceExit src/components/inputs/CodeInput.test.tsx`
Expected: FAIL — `Cannot find module './CodeInput'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/inputs/CodeInput.tsx
import { TextInput, type TextInputProps } from './TextInput';

interface CodeInputProps
  extends Omit<
    TextInputProps,
    | 'autoCapitalize'
    | 'autoComplete'
    | 'autoCorrect'
    | 'keyboardType'
    | 'maxLength'
    | 'secureTextEntry'
  > {
  digits: number;
}

export const CodeInput = ({ digits, ...props }: CodeInputProps) => (
  <TextInput
    {...props}
    autoCapitalize="none"
    autoComplete="one-time-code"
    autoCorrect={false}
    keyboardType="number-pad"
    // The code has exactly this many digits, so the keyboard stops accepting
    // a seventh rather than letting the user find out at submit.
    maxLength={digits}
    secureTextEntry={false}
  />
);
```

- [ ] **Step 4: Export it from the barrel**

```ts
// src/components/index.ts — add this line
export { CodeInput } from './inputs/CodeInput';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --ci --forceExit src/components/inputs/CodeInput.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 6: Verify the whole repo is still clean**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/inputs/CodeInput.tsx src/components/inputs/CodeInput.test.tsx src/components/index.ts
git commit -m "feat(components): add CodeInput primitive"
```

---

### Task 5: `FormField` — the react-hook-form integration

**Files:**
- Create: `src/components/forms/FormField.tsx`
- Create: `src/components/forms/FormField.test.tsx`
- Modify: `src/components/index.ts`

**Interfaces:**
- Consumes: `EmailInput` (Task 2), `PasswordInput` + `PASSWORD_VARIANTS`
  (Task 3), `CodeInput` (Task 4), `TextInput` (Task 1) — all from
  `src/components/inputs/`.
- Produces: `FormField` (component), `FORM_FIELD_TYPES` (`{ TEXT: 'text',
  EMAIL: 'email', PASSWORD: 'password', NEW_PASSWORD: 'newPassword', CODE:
  'code' } as const`), `FormFieldType` (the derived union), re-exported from
  `src/components/index.ts`. `FormField` throws
  `'FormField requires \`digits\` when type is "code".'` if rendered with
  `type="code"` and no `digits`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/forms/FormField.test.tsx
import { render, screen } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';

import { FORM_FIELD_TYPES, FormField, type FormFieldType } from './FormField';

const LABEL = 'Field under test';
const DIGITS = 6;

interface Values {
  value: string;
}

interface HostProps {
  type: FormFieldType;
  digits?: number;
  inputProps?: Record<string, unknown>;
}

const Host = ({ type, digits, inputProps }: HostProps) => {
  const { control } = useForm<Values>({ defaultValues: { value: '' } });

  return (
    <FormField
      control={control}
      digits={digits}
      inputProps={inputProps}
      label={LABEL}
      name="value"
      type={type}
    />
  );
};

const renderField = async (props: HostProps) => render(<Host {...props} />);

describe('FormField', () => {
  it('renders an email input for the email type', async () => {
    await renderField({ type: FORM_FIELD_TYPES.EMAIL });

    expect(screen.getByLabelText(LABEL).props.keyboardType).toBe('email-address');
  });

  it('renders a current-password input for the password type', async () => {
    await renderField({ type: FORM_FIELD_TYPES.PASSWORD });

    expect(screen.getByLabelText(LABEL).props.autoComplete).toBe('current-password');
  });

  it('renders a new-password input for the newPassword type', async () => {
    await renderField({ type: FORM_FIELD_TYPES.NEW_PASSWORD });

    expect(screen.getByLabelText(LABEL).props.autoComplete).toBe('new-password');
  });

  it('renders a code input with the given digits for the code type', async () => {
    await renderField({ type: FORM_FIELD_TYPES.CODE, digits: DIGITS });

    expect(screen.getByLabelText(LABEL).props.maxLength).toBe(DIGITS);
  });

  it('throws when the code type is used without digits', async () => {
    await expect(renderField({ type: FORM_FIELD_TYPES.CODE })).rejects.toThrow(
      'FormField requires `digits` when type is "code".',
    );
  });

  it('renders a bare text input for the text type, and passes inputProps through', async () => {
    // The token field is the reason this exists: not a universal enough
    // concept for its own component, so it configures the bare text input
    // through this escape hatch instead.
    await renderField({
      type: FORM_FIELD_TYPES.TEXT,
      inputProps: { autoCapitalize: 'none', autoComplete: 'off', autoCorrect: false },
    });

    const input = screen.getByLabelText(LABEL);

    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.autoComplete).toBe('off');
    expect(input.props.autoCorrect).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --ci --forceExit src/components/forms/FormField.test.tsx`
Expected: FAIL — `Cannot find module './FormField'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/forms/FormField.tsx
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';

import { CodeInput } from '../inputs/CodeInput';
import { EmailInput } from '../inputs/EmailInput';
import { PASSWORD_VARIANTS, PasswordInput } from '../inputs/PasswordInput';
import { TextInput } from '../inputs/TextInput';

export const FORM_FIELD_TYPES = {
  TEXT: 'text',
  EMAIL: 'email',
  PASSWORD: 'password',
  NEW_PASSWORD: 'newPassword',
  CODE: 'code',
} as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[keyof typeof FORM_FIELD_TYPES];

const MISSING_DIGITS_MESSAGE = 'FormField requires `digits` when type is "code".';

interface FormFieldProps<TValues extends FieldValues> {
  control: Control<TValues>;
  name: Path<TValues>;
  label: string;
  type: FormFieldType;
  digits?: number;
  inputProps?: Record<string, unknown>;
}

export const FormField = <TValues extends FieldValues>({
  control,
  name,
  label,
  type,
  digits,
  inputProps,
}: FormFieldProps<TValues>) => (
  <Controller
    control={control}
    name={name}
    render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => {
      const commonProps = {
        label,
        value: value ?? '',
        onChangeText: onChange,
        onBlur,
        error: error?.message,
        ...inputProps,
      };

      switch (type) {
        case FORM_FIELD_TYPES.EMAIL:
          return <EmailInput {...commonProps} />;
        case FORM_FIELD_TYPES.PASSWORD:
          return <PasswordInput {...commonProps} variant={PASSWORD_VARIANTS.CURRENT} />;
        case FORM_FIELD_TYPES.NEW_PASSWORD:
          return <PasswordInput {...commonProps} variant={PASSWORD_VARIANTS.NEW} />;
        case FORM_FIELD_TYPES.CODE:
          if (digits === undefined) {
            throw new Error(MISSING_DIGITS_MESSAGE);
          }

          return <CodeInput {...commonProps} digits={digits} />;
        case FORM_FIELD_TYPES.TEXT:
          return <TextInput {...commonProps} />;
      }
    }}
  />
);
```

- [ ] **Step 4: Export it from the barrel**

```ts
// src/components/index.ts — add this line
export { FORM_FIELD_TYPES, FormField, type FormFieldType } from './forms/FormField';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --ci --forceExit src/components/forms/FormField.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Verify the whole repo is still clean**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/forms/FormField.tsx src/components/forms/FormField.test.tsx src/components/index.ts
git commit -m "feat(components): add FormField react-hook-form integration"
```

---

### Task 6: Migrate the six `auth` screens; delete `FormTextField`

**Files:**
- Modify: `src/modules/auth/screens/SignInScreen.tsx`
- Modify: `src/modules/auth/screens/SignUpScreen.tsx`
- Modify: `src/modules/auth/screens/ForgotPasswordScreen.tsx`
- Modify: `src/modules/auth/screens/ResetPasswordScreen.tsx`
- Modify: `src/modules/auth/screens/ChangePasswordScreen.tsx`
- Modify: `src/modules/auth/screens/VerifyEmailScreen.tsx`
- Delete: `src/modules/auth/components/FormTextField.tsx`
- Delete: `src/modules/auth/components/FormTextField.test.tsx`

**Interfaces:**
- Consumes: `FormField`, `FORM_FIELD_TYPES` (unused directly — types are
  literals per D6) from `@/components` (Task 5); `VERIFICATION_CODE_DIGITS`
  from `../validations` (already exists, only its consumer changes in
  `VerifyEmailScreen.tsx`).

No new test files — the six screens' existing colocated tests
(`SignInScreen.test.tsx` etc.) assert on rendered text, labels and
accessibility state, none of which this migration changes. They are the
verification for this task, run in Step 4 below.

- [ ] **Step 1: Migrate `SignInScreen.tsx`**

Replace the `FormTextField` import:

```diff
-import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
+import { FormField } from '@/components';
```

Replace the two `FormTextField` usages:

```diff
-      <FormTextField
-        control={control}
-        label={COPY.emailLabel}
-        name="email"
-        type={FIELD_TYPES.EMAIL}
-      />
-      <FormTextField
-        control={control}
-        label={COPY.passwordLabel}
-        name="password"
-        type={FIELD_TYPES.PASSWORD}
-      />
+      <FormField control={control} label={COPY.emailLabel} name="email" type="email" />
+      <FormField control={control} label={COPY.passwordLabel} name="password" type="password" />
```

- [ ] **Step 2: Migrate `SignUpScreen.tsx`**

```diff
-import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
+import { FormField } from '@/components';
```

```diff
-      <FormTextField
-        control={control}
-        label={COPY.emailLabel}
-        name="email"
-        type={FIELD_TYPES.EMAIL}
-      />
+      <FormField control={control} label={COPY.emailLabel} name="email" type="email" />
```

- [ ] **Step 3: Migrate `ForgotPasswordScreen.tsx`**

```diff
-import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
+import { FormField } from '@/components';
```

```diff
-      <FormTextField
-        control={control}
-        label={COPY.emailLabel}
-        name="email"
-        type={FIELD_TYPES.EMAIL}
-      />
+      <FormField control={control} label={COPY.emailLabel} name="email" type="email" />
```

- [ ] **Step 4: Migrate `ResetPasswordScreen.tsx`**

```diff
-import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
+import { FormField } from '@/components';
```

```diff
-      <FormTextField
-        control={control}
-        label={COPY.tokenLabel}
-        name="token"
-        type={FIELD_TYPES.TOKEN}
-      />
-      <FormTextField
-        control={control}
-        label={COPY.newPasswordLabel}
-        name="newPassword"
-        type={FIELD_TYPES.NEW_PASSWORD}
-      />
-      <FormTextField
-        control={control}
-        label={COPY.confirmPasswordLabel}
-        name="confirmPassword"
-        type={FIELD_TYPES.NEW_PASSWORD}
-      />
+      <FormField
+        control={control}
+        inputProps={{ autoCapitalize: 'none', autoComplete: 'off', autoCorrect: false }}
+        label={COPY.tokenLabel}
+        name="token"
+        type="text"
+      />
+      <FormField
+        control={control}
+        label={COPY.newPasswordLabel}
+        name="newPassword"
+        type="newPassword"
+      />
+      <FormField
+        control={control}
+        label={COPY.confirmPasswordLabel}
+        name="confirmPassword"
+        type="newPassword"
+      />
```

- [ ] **Step 5: Migrate `ChangePasswordScreen.tsx`**

```diff
-import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
+import { FormField } from '@/components';
```

```diff
-      <FormTextField
-        control={control}
-        label={COPY.currentPasswordLabel}
-        name="currentPassword"
-        type={FIELD_TYPES.PASSWORD}
-      />
-      <FormTextField
-        control={control}
-        label={COPY.newPasswordLabel}
-        name="newPassword"
-        type={FIELD_TYPES.NEW_PASSWORD}
-      />
-      <FormTextField
-        control={control}
-        label={COPY.confirmPasswordLabel}
-        name="confirmPassword"
-        type={FIELD_TYPES.NEW_PASSWORD}
-      />
+      <FormField
+        control={control}
+        label={COPY.currentPasswordLabel}
+        name="currentPassword"
+        type="password"
+      />
+      <FormField
+        control={control}
+        label={COPY.newPasswordLabel}
+        name="newPassword"
+        type="newPassword"
+      />
+      <FormField
+        control={control}
+        label={COPY.confirmPasswordLabel}
+        name="confirmPassword"
+        type="newPassword"
+      />
```

- [ ] **Step 6: Migrate `VerifyEmailScreen.tsx`**

Add `VERIFICATION_CODE_DIGITS` to the existing validations import, and swap
the component import:

```diff
-import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
+import { FormField } from '@/components';
```

```diff
-import { type ConfirmSignUpValues, confirmSignUpSchema, PASSWORD_HINT } from '../validations';
+import {
+  type ConfirmSignUpValues,
+  confirmSignUpSchema,
+  PASSWORD_HINT,
+  VERIFICATION_CODE_DIGITS,
+} from '../validations';
```

```diff
-      <FormTextField
-        control={control}
-        label={COPY.emailLabel}
-        name="email"
-        type={FIELD_TYPES.EMAIL}
-      />
-      <FormTextField control={control} label={COPY.codeLabel} name="code" type={FIELD_TYPES.CODE} />
-      <FormTextField
-        control={control}
-        label={COPY.passwordLabel}
-        name="password"
-        type={FIELD_TYPES.NEW_PASSWORD}
-      />
-      <FormTextField
-        control={control}
-        label={COPY.confirmPasswordLabel}
-        name="confirmPassword"
-        type={FIELD_TYPES.NEW_PASSWORD}
-      />
+      <FormField control={control} label={COPY.emailLabel} name="email" type="email" />
+      <FormField
+        control={control}
+        digits={VERIFICATION_CODE_DIGITS}
+        label={COPY.codeLabel}
+        name="code"
+        type="code"
+      />
+      <FormField control={control} label={COPY.passwordLabel} name="password" type="newPassword" />
+      <FormField
+        control={control}
+        label={COPY.confirmPasswordLabel}
+        name="confirmPassword"
+        type="newPassword"
+      />
```

- [ ] **Step 7: Delete `FormTextField`**

```bash
git rm src/modules/auth/components/FormTextField.tsx src/modules/auth/components/FormTextField.test.tsx
```

- [ ] **Step 8: Fix import ordering**

Run: `pnpm lint:fix`
Expected: reformats the six screens' import blocks (grouping `@/components`
with `@/errors`, etc.) with no logic changes. Re-read one changed file
afterward to confirm nothing unexpected moved.

- [ ] **Step 9: Run the full test suite**

Run: `pnpm check && npx jest --ci --forceExit`
Expected: PASS — `tsc`/`biome` clean, every suite green including all six
screen tests (they assert on rendered text/labels/accessibility state, which
`FormField` preserves) and `FormField.test.tsx`/the four primitive tests
from Tasks 1–5. If a screen test fails, read its actual failure message
before changing anything — do not assume it is this migration without
checking (Rule: never claim success without real output).

- [ ] **Step 10: Commit**

```bash
git add src/modules/auth/screens src/modules/auth/components
git commit -m "refactor(auth): migrate screens to FormField, delete FormTextField"
```

---

### Task 7: Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `ARCHITECTURE.md`
- Modify: `src/components/README.md`
- Modify: `src/modules/auth/README.md`

**Interfaces:** none — documentation only, no code.

- [ ] **Step 1: `AGENTS.md` Rule 5 — the second-consumer exception**

In the "## 5. Structure" section, replace:

```diff
-- A component moves out of `modules/<x>/` into `src/components/` only once a
-  second module needs it.
+- A component moves out of `modules/<x>/` into `src/components/` only once a
+  second module needs it — **unless** it is a design-system primitive every
+  app cloned from this boilerplate is known in advance to need (the "second
+  consumer" is then the next app, not the next module in this repo). Today's
+  example: `src/components/inputs/` and `forms/`. `SubmitButton` stays in
+  `modules/auth/components/` under the normal rule — there is no comparable
+  "every app needs exactly this button" argument for it.
```

- [ ] **Step 2: `ARCHITECTURE.md` — the tree**

Replace the `components/` entry (currently 3 lines, "vazio por enquanto")
with:

```diff
-├── components/             componentes compartilhados por mais de um módulo — vazio por enquanto
-│   ├── index.ts             (sem exports ainda)
-│   └── README.md
+├── components/               primitivas de UI conhecidas de antemão como multi-app — exceção documentada à regra do segundo consumidor (ver abaixo, não "vazio")
+│   ├── inputs/               primitivas puras, sem react-hook-form
+│   │   ├── TextInput.tsx     base: label, value/onChangeText, error, className
+│   │   ├── EmailInput.tsx    teclado/autocomplete de email
+│   │   ├── PasswordInput.tsx  secureTextEntry + variant 'current' | 'new'
+│   │   ├── CodeInput.tsx     teclado numérico, one-time-code, `digits` do chamador
+│   │   └── *.test.tsx        colocados, um por componente
+│   ├── forms/                 a integração com react-hook-form
+│   │   ├── FormField.tsx     Controller + despacha pro input certo por `type`
+│   │   └── FormField.test.tsx
+│   ├── index.ts
+│   └── README.md
```

In the `modules/auth/` subtree, replace the `components/` line:

```diff
-│   │   ├── components/      FormTextField.tsx, SubmitButton.tsx — internos deste módulo
+│   │   ├── components/      FormErrorMessage.tsx, SubmitButton.tsx — internos deste módulo
```

- [ ] **Step 3: `ARCHITECTURE.md` — the boundary rule**

Right after the existing "Um componente só sai de dentro de um módulo..."
paragraph in the "A regra de fronteira entre módulos" section, add:

```md
**Exceção:** uma primitiva de design system que qualquer app clonado deste
boilerplate vai precisar — hoje, os inputs de formulário em
`src/components/inputs/` e `forms/` — pode nascer direto em `src/components/`
mesmo com um consumidor só neste repositório. O "segundo consumidor" aqui é o
próximo app, não o próximo módulo. `SubmitButton` continua em
`modules/auth/components/` sob a regra normal: não há um argumento
equivalente de "todo app precisa exatamente deste botão", então movê-lo agora
seria a especulação que a regra existe para barrar.
```

- [ ] **Step 4: `ARCHITECTURE.md` — the "starts flat" paragraph**

Replace:

```diff
-`components/`, assim como `modules/<m>/components/`, começa **flat** (um
-arquivo por componente). Subpastas por categoria (`ui/`, `layout/`,
-`feedback/`) só valem a pena quando categorias distintas ficam visíveis ali
-dentro — não se cria essa divisão antecipadamente.
+`modules/<m>/components/` começa **flat** (um arquivo por componente).
+Subpastas por categoria só valem a pena quando categorias distintas ficam
+visíveis ali dentro — não se cria essa divisão antecipadamente.
+
+`src/components/` foge dessa regra desde o início: `inputs/` (primitivas de
+UI puras) e `forms/` (a integração com react-hook-form) já são duas
+categorias reais e distintas no dia em que a pasta ganha seu primeiro
+export — não uma divisão especulativa.
```

- [ ] **Step 5: `src/components/README.md`**

Replace the entire file:

```md
# Components

Primitivas de UI conhecidas de antemão como necessárias a **qualquer** app
clonado deste boilerplate — não "componentes compartilhados por mais de um
módulo" no sentido literal, já que hoje só existe o módulo `auth`. Essa é uma
exceção documentada à regra do segundo consumidor (ver `ARCHITECTURE.md` e a
Rule 5 do `AGENTS.md`): o "segundo consumidor" aqui é o próximo app, não o
próximo módulo deste repositório.

Duas subpastas desde o primeiro export, não uma organização especulativa:
`inputs/` e `forms/` são categorias genuinamente distintas (UI pura vs.
integração com uma lib de formulário) — o oposto do "começa flat" que ainda
vale para `modules/<m>/components/`.

## Components

| Name | Description |
| ---- | ------------- |
| `TextInput` | Primitiva base: label, `value`/`onChangeText` controlados, `error?`, `className`. Aceita qualquer prop nativa de `TextInput` via passthrough. |
| `EmailInput` | `TextInput` com teclado e autocomplete de e-mail fixados. |
| `PasswordInput` | `TextInput` com `secureTextEntry` e `variant: 'current' \| 'new'` — só o `autoComplete` muda entre os dois. |
| `CodeInput` | `TextInput` com teclado numérico e `one-time-code`; `digits` (o `maxLength`) vem de quem usa. |
| `FormField` | Liga um `Controller` do react-hook-form à primitiva certa, escolhida por `type`. `inputProps` é o escape hatch pra um campo sem componente próprio (ex.: token de reset). |

## Constants

| Name | Description |
| ---- | ------------- |
| `PASSWORD_VARIANTS` | `current` \| `new` — prop `variant` do `PasswordInput`. |
| `FORM_FIELD_TYPES` | `text` \| `email` \| `password` \| `newPassword` \| `code` — prop `type` do `FormField`. |

## Conventions

- **`inputs/` não sabe que react-hook-form existe.** Só `FormField`
  (`forms/`) importa a lib — uma primitiva com RHF embutido não serviria a um
  campo fora de um form (ex.: uma busca com estado local).
- **`type` e `variant` são passados como literal, não como a constante** —
  `<FormField type="password">`, não `type={FORM_FIELD_TYPES.PASSWORD}`. Os
  dois já são tipados com a union derivada da constante, então o `tsc` recusa
  um valor fora dela na hora — a mesma proteção que nome de rota já tem. A
  constante segue existindo pra quem lê o valor de volta (o `switch` dentro do
  `FormField`), só não pra quem está só autorando o valor num prop já tipado.
- **`label` continua vindo de um `COPY`**, ao contrário de `type`/`variant`:
  copy voltada ao usuário não tem union do `tsc` te protegendo, então a Rule 4
  do `AGENTS.md` vale sem exceção aqui.
- **`FormField.digits` é obrigatório só quando `type` é `code`**, e a
  violação lança em vez de assumir um valor — um campo de código sem
  `digits` é um erro de uso do componente, não um estado que a UI deveria
  absorver em silêncio.
- Os estilos de cada variante ficam em mapas indexados pela constante
  (`AUTO_COMPLETE_BY_VARIANT`), nunca em uma cadeia de ternários.
```

- [ ] **Step 6: `src/modules/auth/README.md`**

Add a new bullet at the end of the "## Conventions" section:

```md
- **Campos de formulário vêm de `@/components`, não daqui.** `FormField`/
  `FORM_FIELD_TYPES` (em `src/components/forms/`) substituem o antigo
  `FormTextField` deste módulo — ele foi promovido junto com as primitivas de
  input, porque qualquer app clonado deste boilerplate precisa dos mesmos
  tipos de campo. Ver `src/components/README.md`.
```

- [ ] **Step 7: Verify**

Run: `pnpm check`
Expected: PASS (Markdown isn't linted by Biome, but this catches any code
fence accidentally broken by the edits above).

- [ ] **Step 8: Commit**

```bash
git add AGENTS.md ARCHITECTURE.md src/components/README.md src/modules/auth/README.md
git commit -m "docs: document the generic form inputs and their second-consumer exception"
```

---

## Final Verification

After Task 7, run once more from a clean state:

```bash
pnpm check
npx jest --ci --forceExit
```

Expected: both clean, matching Task 6's numbers (all pre-existing suites
plus the 5 new ones from Tasks 1–5: `TextInput`, `EmailInput`,
`PasswordInput`, `CodeInput`, `FormField`).

Confirm no stale reference remains:

```bash
grep -rln "FormTextField" src
```

Expected: no output.
