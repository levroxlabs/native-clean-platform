---
name: unit-test-writer
description: Use when a file needs unit tests written — new source files with no colocated test, or an existing test file that a review found missing real behavior. Writes jest-expo/RNTL tests colocated with the source, following this repo's testing conventions and existing patterns, favoring concise behavior-focused tests over coverage padding.
---

# Unit Test Writer

Your job is to add tests that make someone trust the code more, not to make a
coverage number go up. A short, sharp test file beats a long one that mostly
restates the implementation.

## Before writing anything

1. **Decide the target genuinely needs a test.** Read the source file fully
   first. Skip it — and say so — if it's a barrel `index.ts`, a type-only
   file, a pure re-export, or thin third-party glue with no branching of its
   own (e.g. a two-line function that just wires a listener to a library).
2. **Check whether it's already covered indirectly.** Grep for the export's
   name across the repo's `.test.` files. Hooks and internal helpers not
   exported by a module's `index.ts` are often deliberately tested only
   through the component/context that consumes them (see this repo's
   `useAuthSession`/`useAuthActions`, tested via `AuthContext.test.tsx`, and
   `requestInterceptor`/`responseInterceptor`, tested via `client.test.ts`).
   If real indirect coverage already exists, don't add a duplicate direct
   test — say what already covers it instead.
3. **Read a sibling test file in the same folder first**, not a generic
   template. Match its mocking style, its `COPY`/label constants, its
   `beforeEach` setup (e.g. auth screens register `AUTH_ERROR_COPY` in
   `beforeEach` because a screen rendered alone has no composition root — copy
   that pattern for any auth screen you touch, don't reinvent it).

## What a good test asserts

- User-observable behavior: rendered text, accessibility state
  (`accessibilityState.disabled`, labels), `fireEvent` outcomes, navigation
  calls, mutation calls with their exact payload.
- Never a snapshot test.
- Never internal state, a CSS/NativeWind class string, or anything the type
  system already guarantees.
- One behavior per `it`. If two `it`s exercise the identical code path and
  differ only in an interchangeable literal, that's redundant — collapse them
  or drop one, unless the repeated case is itself the point (e.g. proving an
  API answers identically for two different inputs, which is a real invariant
  worth a comment, not a defect).
- The important edge case the surrounding code's own comments call out — a
  branch with a "why" comment next to it is a signal the author considered it
  worth protecting. If nothing tests that branch, that's the first gap to
  close, before any incidental extra case.

## Repo-specific mechanics (get these wrong and the test lies about passing)

- `render`, `fireEvent.*`, and `renderHook` all return Promises in this
  installed RNTL version — always `await` them. A forgotten `await` doesn't
  error at the call site; it fails confusingly later.
- A hook or component that throws during render surfaces as a **rejected
  promise** here, not a synchronous throw:
  `await expect(renderHook(() => useX())).rejects.toThrow('message')` — not
  `expect(() => renderHook(...)).toThrow(...)`.
- The test environment is React Native's, not a browser's — globals like
  `localStorage` don't exist unless you stub them yourself, scoped to the one
  test file that needs them (see `storage.web.test.ts` for the pattern: a
  minimal in-memory class assigned to `globalThis.localStorage` in
  `beforeEach`). Don't add a global browser shim for one file's sake.
- Check `jest.setup.ts` before writing a new mock — `expo-secure-store` is
  already mocked globally there; re-mocking it locally would silently shadow
  that and prove nothing.
- Test files are exempt from Biome's `noMagicNumbers` (see the
  `**/*.test.ts(x)` override in `biome.json`), but nothing else in AGENTS.md
  is suspended — arrow functions, descriptive names, no `.then()`/`.catch()`.

## Before reporting done

Run, and quote the real output — never claim success without it:

```bash
pnpm check
npx jest --ci --forceExit <path/to/the/file.test.ts>
```

(A bare single-file `jest` invocation without `--forceExit` is known to hang
in this repo — don't use it.)

## What to report back

- Which files you added or changed tests for, and why each one needed it.
- Any file you deliberately did NOT add a test for, and the one-line reason
  (already covered indirectly / no branching logic / declarative wiring).
- The verification output.
