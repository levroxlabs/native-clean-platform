# Unit Testing Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the boilerplate a working, documented unit testing convention (jest-expo + React Native Testing Library) that new modules and projects cloning this repo can immediately follow.

**Architecture:** Add `jest-expo` as the Jest preset (it configures the RN/Expo native mocks) plus `@testing-library/react-native` for components. Tests are colocated next to the file they test. One pure-logic test and one component test prove the setup end-to-end; documentation in `AGENTS.md` and `README.md` captures the convention for future contributors.

**Tech Stack:** jest-expo, jest, @testing-library/react-native, pnpm, Biome, TypeScript. Expo SDK 57, React Native 0.86, React 19.

**Spec:** `docs/superpowers/specs/2026-08-20-unit-testing-setup-design.md`

## Global Constraints

- All code (including test code) is English only: identifiers, file names, comments — no exceptions. (AGENTS.md Rule 1)
- Every function/component is an arrow function assigned to `const`, never `function` declarations. (AGENTS.md Rule 2)
- No magic strings or numbers outside test files — see Task 3 for the one deliberate exception. (AGENTS.md Rule 4)
- Tests are colocated next to the file under test (`Foo.tsx` + `Foo.test.tsx`), never in a `__tests__/` folder — matches the module-based structure. (Spec §Design.2)
- `pnpm test` stays separate from `pnpm check` — do not add testing to the `check` script. (Spec §Design.1)
- Component tests assert on user-observable behavior (rendered text, accessibility state, interactions) — never snapshot tests. (Spec §Design.3)
- pnpm only, `nodeLinker: hoisted` — never assume symlinked `node_modules`.

---

### Task 1: Jest + jest-expo setup with a pure-logic test

**Files:**
- Modify: `package.json`
- Modify: `biome.json`
- Create: `src/utils/cn.test.ts`

**Interfaces:**
- Consumes: `cn` from `src/utils/cn.ts:9` (signature: `cn(...inputs: ClassValue[]): string`)
- Produces: the `"jest"` config block in `package.json`, the `pnpm test` / `pnpm test:ci` scripts, and the Biome override for `**/*.test.ts`/`**/*.test.tsx` — every later task's test files rely on both.

- [ ] **Step 1: Install the testing dependencies**

Run:
```bash
pnpm add -D jest-expo jest @types/jest @testing-library/react-native
```

- [ ] **Step 2: Add the `test` scripts to `package.json`**

In the `"scripts"` block, after `"check": "pnpm typecheck && pnpm lint"`, add:

```json
    "check": "pnpm typecheck && pnpm lint",
    "test": "jest --watchAll",
    "test:ci": "jest --ci"
```

- [ ] **Step 3: Add the `jest` config block to `package.json`**

Add a new top-level key, as a sibling of `"scripts"` and `"dependencies"`:

```json
  "jest": {
    "preset": "jest-expo",
    "setupFiles": [
      "react-native-gesture-handler/jestSetup"
    ]
  },
```

- [ ] **Step 4: Add the Biome override for test files**

In `biome.json`, add a new entry to the `"overrides"` array (after the `src/theme/tokens.js` override):

```json
    {
      "includes": ["**/*.test.ts", "**/*.test.tsx"],
      "linter": {
        "rules": {
          "style": {
            "noMagicNumbers": "off"
          }
        }
      }
    }
```

- [ ] **Step 5: Write the failing test**

Create `src/utils/cn.test.ts`:

```ts
import { cn } from './cn';

describe('cn', () => {
  it('merges conflicting Tailwind classes, keeping the last one', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('drops falsy values', () => {
    expect(cn('text-base', false && 'hidden', undefined, 'font-bold')).toBe('text-base font-bold');
  });
});
```

- [ ] **Step 6: Run the test to verify the setup resolves the module and runner correctly**

Run: `pnpm test:ci src/utils/cn.test.ts`
Expected: PASS, 2 tests. (Since `cn` already exists and works, this run validates the Jest/Babel/Biome setup rather than driving new production code — there is no separate red step here.)

- [ ] **Step 7: Confirm Biome still passes on the new test file**

Run: `pnpm lint`
Expected: no `noMagicNumbers` violation on `p-2`/`p-4` string literals is a non-issue (that rule only flags numbers), but re-run to confirm no other lint errors on `cn.test.ts` (arrow functions, naming, etc. all still apply).

- [ ] **Step 8: Commit**

```bash
git add package.json biome.json src/utils/cn.test.ts
git commit -m "test: add jest-expo unit testing setup with a pure-logic example"
```

---

### Task 2: Component testing with React Native Testing Library

**Files:**
- Create: `src/components/Button.test.tsx`

**Interfaces:**
- Consumes: `Button` from `src/components/Button.tsx:34` (props: `{ label: string; variant?: ButtonVariant; isLoading?: boolean; disabled?: boolean; className?: string }`), and the Jest/Biome config produced by Task 1.
- Produces: nothing consumed by later tasks — this is a leaf deliverable proving component rendering works end-to-end (NativeWind class props, gesture-handler's native module, accessibility props).

- [ ] **Step 1: Write the test**

Create `src/components/Button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';

import { Button } from './Button';

describe('Button', () => {
  it('renders its label', () => {
    render(<Button label="Continue" />);

    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('marks the button as disabled and busy while loading', () => {
    render(<Button label="Continue" isLoading />);

    const button = screen.getByRole('button');

    expect(button.props.accessibilityState?.disabled).toBe(true);
    expect(button.props.accessibilityState?.busy).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails before anything is broken on purpose — sanity-check the harness catches a wrong assertion**

Temporarily change `expect(button.props.accessibilityState?.disabled).toBe(true)` to `.toBe(false)`, run:

Run: `pnpm test:ci src/components/Button.test.tsx`
Expected: FAIL on the second test (`expected false, received true`).

Revert the change back to `.toBe(true)`.

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm test:ci src/components/Button.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 4: Run the full test suite to confirm nothing regressed**

Run: `pnpm test:ci`
Expected: PASS, both `cn.test.ts` and `Button.test.tsx` (4 tests total).

- [ ] **Step 5: Run Biome and TypeScript checks**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/Button.test.tsx
git commit -m "test: add a React Native Testing Library example for Button"
```

---

### Task 3: Document the testing convention

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the conventions established in Tasks 1–2 (jest-expo, colocation, `pnpm test`/`pnpm test:ci`, the Biome override).
- Produces: nothing — documentation leaf.

- [ ] **Step 1: Add "8. Tests" to `AGENTS.md`**

After the "## 7. Tooling" section (ends at the "Class sorting is not enforced..." paragraph, currently the last section in the file), add:

```md

## 8. Tests

Tests use **jest-expo** (Jest, configured for Expo/React Native) plus
**React Native Testing Library** for components. No Detox/Maestro (E2E) yet.

- Tests are **colocated** next to the file they test — `Button.tsx` +
  `Button.test.tsx` — never in a `__tests__/` folder, matching the
  module-based structure from [Rule 5](#5-structure).
- Pure logic (`src/utils/`, hooks, module logic) is tested with plain Jest:
  `describe`/`it`/`expect`.
- Components and screens are tested with `@testing-library/react-native`,
  asserting on user-observable behavior — rendered text, accessibility
  state, `fireEvent` interactions. Never snapshot tests.
- Test files are exempt from Biome's `noMagicNumbers` (see the
  `**/*.test.ts`/`**/*.test.tsx` override in `biome.json`) since assertions
  compare against literal values by design. Every other rule still applies.

```bash
pnpm test       # jest --watchAll
pnpm test:ci    # jest --ci
```

`pnpm test` is intentionally **not** part of `pnpm check` — typecheck and
lint stay the fast pre-commit gate; run tests on demand or in CI.
```

- [ ] **Step 2: Add the test commands to `README.md`**

In the "Checagens de qualidade" code block (currently `pnpm check`, `pnpm typecheck`, `pnpm lint`, `pnpm lint:fix`, `pnpm format`), add two lines:

```bash
pnpm check       # typecheck + lint — rode antes de cada commit
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome check
pnpm lint:fix    # biome check --write (correções seguras)
pnpm format      # biome format --write
pnpm test        # jest --watchAll
pnpm test:ci     # jest --ci
```

- [ ] **Step 3: Update the roadmap in `README.md`**

Find the "Padrões" roadmap line (already checked `[x]`) and add a mention of the testing convention to it, and change:

```md
- [x] **Padrões** — Biome substitui ESLint/Prettier, pnpm, convenções do
      projeto em `AGENTS.md`, código só em inglês, README por módulo,
      sem strings ou números mágicos.
```

to:

```md
- [x] **Padrões** — Biome substitui ESLint/Prettier, pnpm, convenções do
      projeto em `AGENTS.md`, código só em inglês, README por módulo,
      sem strings ou números mágicos, testes unitários com jest-expo +
      React Native Testing Library.
```

- [ ] **Step 4: Verify Biome and TypeScript still pass**

Run: `pnpm check`
Expected: no errors (Markdown files are not linted by Biome, so this mainly guards against an accidental syntax slip elsewhere).

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: document the jest-expo unit testing convention"
```
