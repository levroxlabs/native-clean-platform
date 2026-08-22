---
name: splitting-large-files
description: Use when a component, hook, screen, or utility file is approaching or exceeds 250 lines, or before adding a substantial new block of logic to an already-large file — flags file bloat and provides patterns for extracting subcomponents, custom hooks, and pure helper functions to keep each file focused on one responsibility.
---

# Splitting Large Files

## Overview

No component, hook, screen, or utility file exceeds **250 lines**. The
number itself isn't the point — it's a proxy for "this file is doing more
than one job." A file that crosses 250 lines is almost always mixing
concerns that deserve their own file: rendering, data fetching, formatting,
validation, and constants all living in one place.

This is a **documented convention, not a machine-enforced one** — nothing
in `pnpm check` blocks a large file. Treat the threshold as a signal to
check during self-review and code review, the same way you'd catch a
stale [module README](../../../AGENTS.md#3-module-readme).

## When to Use

- Before adding new logic to a file already near 250 lines — check with
  `wc -l path/to/File.tsx` first, not after the file is already 400 lines.
- Reviewing a diff where a component's JSX has grown several visually
  distinct sections, or a hook is doing more than one thing (fetching
  *and* local UI state *and* validation).
- A file keeps needing a scrollbar to review — that's the human version
  of the same signal `wc -l` gives you.

## The Rule

Applies **per file**, to everything under `src/` — components, hooks,
screens, utility modules. There's no partial exception for "this one is
special." If a file is crossing 250 lines, that's the file telling you it
has more than one responsibility — the fix is always extraction, never a
longer file with a clear conscience.

## Core Pattern — Where the Extra Lines Usually Are

| Symptom | Extraction |
|---|---|
| JSX return with several visually distinct sections | Each section becomes its own subcomponent, colocated in the same module (moves to `src/components/` only once a second module needs it — [Rule 5](../../../AGENTS.md#5-structure)) |
| Data-fetching, polling, or subscription logic living inside a component | Extract into a custom hook (`useX`) in the module's `hooks/` folder |
| Several pure calculation/formatting functions defined inline | Extract into the module's `utils.ts` |
| Large inline type/interface blocks | Extract into the module's `types.ts` |
| A long list of constants or copy strings | Extract into `constants.ts` / a `COPY` object — already required by [Rule 4](../../../AGENTS.md#4-no-magic-strings-or-numbers) |
| A "screen" file that actually covers more than one flow | Question whether it's really one module — may need splitting into separate modules per [Rule 5](../../../AGENTS.md#5-structure), not just separate files |

Name every extracted piece the way [choosing-descriptive-names](../choosing-descriptive-names/SKILL.md)
describes — a good extraction with a lazy name (`Section1`, `helpers2`)
just moves the readability problem instead of fixing it.

## Common Mistakes

- **Splitting to hit the number, not along a real seam.** Cutting a
  function in half arbitrarily just to shrink line count doesn't reduce
  complexity — it hides it behind an extra file. Only extract where a
  genuine responsibility boundary already exists.
- **A subcomponent used exactly once that takes ten props.** If the
  "extraction" needs as many props as the original had local variables,
  it isn't a real seam — it's the same code with an import between the
  two halves.
- **Forgetting the module README.** Extracting into a new file that
  becomes a fresh export means the [module README](../../../AGENTS.md#3-module-readme)
  needs updating in the same change — a stale README is worse than none.
- **Extracting straight into `src/components/`.** Per [Rule 5](../../../AGENTS.md#5-structure),
  a component only moves out of its module once a *second* module needs
  it. A same-module extraction stays local first.
