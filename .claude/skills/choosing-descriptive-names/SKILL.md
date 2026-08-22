---
name: choosing-descriptive-names
description: Use when writing or reviewing any variable, function, parameter, or component name — before naming a loop counter, callback argument, helper function, destructured field, or "quick" scratch variable, and when reviewing code that contains abbreviated or single-letter identifiers like x, ab, fn, tmp, idx, cb, evt, err, req, res, val, obj, arr, ctx, cfg.
---

# Choosing Descriptive Names

## Overview

A name is the only documentation most variables and functions ever get.
Every identifier must say what it holds or what it does, in full words —
never a single letter, a truncation, or a generic placeholder. This holds
in every scope, including loop counters, callback parameters, one-line
helpers, and "temporary" code — none of those are ever an exception.

**Shortness is never a reason to abbreviate. Clarity is not optional
because the scope is small.**

## When to Use

- Naming any `const`, function, arrow function, component, prop, or
  parameter — including ones you expect to be short-lived.
- Naming loop/array-callback parameters (`.map`, `.filter`, `.reduce`,
  `for...of`) — the single most common place abbreviations sneak in
  (`o =>`, `(acc, x) =>`).
- Reviewing a diff or PR and spotting a name that requires reading the
  implementation (or asking the author) to understand what it holds.
- Writing quick scratch scripts, one-off debug code, or throwaway
  helpers — "temporary" code outlives its label far more often than
  intended, so it gets the same names as production code.

Not a substitute for [Rule 4 of AGENTS.md](../../../AGENTS.md#4-no-magic-strings-or-numbers)
(extracting magic strings/numbers into named constants) — that rule is
about *what gets named*; this skill is about *how it's named* once it
does.

## Core Pattern

| Bad | Good | Why |
|---|---|---|
| `const x = user.email;` | `const userEmail = user.email;` | `x` says nothing about content or purpose |
| `orders.filter(o => o.status === 'paid')` | `orders.filter((order) => order.status === 'paid')` | callback params are read as often as top-level ones |
| `const fn = () => {...}` | `const calculateTotalPrice = () => {...}` | `fn` restates the type, not the purpose |
| `for (let i = 0; i < n; i++)` | `for (let dayIndex = 0; dayIndex < totalDays; dayIndex++)` | `i`/`n` force the reader to trace context to learn what's being counted |
| `const arr = items.map((it) => it.id);` | `const itemIds = items.map((item) => item.id);` | `arr`/`it` restate the type instead of naming the content |
| `catch (e) { ... }` | `catch (loadError) { ... }` | `e` gives no hint what failed or what the handler does with it |
| `const btn = <Button />;` | `const submitButton = <Button />;` | component variables need the same clarity as any other |

The fix is always the same move: name what the value **is** or what the
function **does**, not its type, its shortness, or its position.

## Quick Reference — Common Abbreviations to Replace

| Instead of | Write the full word |
|---|---|
| `fn`, `cb`, `handler` (bare) | the actual action: `onSubmit`, `formatCurrency`, `handleLoginPress` |
| `val`, `v` | what the value represents: `discountAmount`, `selectedOption` |
| `obj`, `o` | the entity: `user`, `order`, `paymentMethod` |
| `arr`, `list` (bare) | the plural of its contents: `orderIds`, `activeUsers` |
| `idx`, `i`, `n` (as a loop bound) | what's being indexed/counted: `rowIndex`, `totalItems` |
| `tmp`, `temp` | what it temporarily holds: `pendingUser`, `unformattedDate` |
| `err`, `e` | what failed: `validationError`, `networkError` |
| `req`, `res` | the specific request/response: `loginRequest`, `profileResponse` |
| `ctx` | the context's contents: `authContext`, `themeContext` |
| `cfg` | what's configured: `retryConfig`, `themeConfig` |
| `evt`, `ev` | the specific event: `pressEvent`, `scrollEvent` |
| `str`, `num` | what the string/number represents: `searchQuery`, `retryCount` |
| `el`, `ref` (bare) | what's rendered/referenced: `scrollViewRef`, `submitButtonElement` |
| `prev`, `curr` (bare) | what changed: `previousBalance`, `currentBalance` |
| `ab`, `xy`, or any two-letter placeholder | never — there is always a real name |

## Common Mistakes

- **"It's just a loop counter, `i` is idiomatic."** Idiomatic in general
  doesn't mean readable here — name what's being counted (`rowIndex`,
  `retryAttempt`). The three extra characters cost nothing; the ambiguity
  costs a reread every time someone touches the loop.
- **"The callback is one line, the param name doesn't matter."** One-line
  callbacks are read in isolation constantly during review — `(o) =>
  o.id` forces the reader to scroll up to the array's declaration to
  learn what `o` is; `(order) => order.id` doesn't.
- **"This is scratch code, it won't ship."** Scratch code is read, copy-pasted
  into real code, and debugged under time pressure more often than it's
  deleted. Name it as if it will ship, because it might.
- **"The type annotation already tells you what it is."** A type tells you
  the *shape* (`string`, `User[]`); it never tells you the *role*
  (`searchQuery` vs. `errorMessage` — both `string`).
- **Restating the type instead of naming the content** (`arr`, `obj`,
  `fn`, `list`, `data`, `item` used as the *only* name). These describe
  the container, not what's inside it — the content is always more
  specific than its container type.
- **Truncating a clear word to save characters** (`btn` for `button`,
  `msg` for `message`, `usr` for `user`). If the full word is already
  short, there is no reason to cut it further.
