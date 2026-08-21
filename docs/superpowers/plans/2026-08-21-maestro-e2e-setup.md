# Maestro E2E Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Maestro as this boilerplate's E2E testing convention — dev
client build target, `.maestro/` flow folder, npm scripts, and
documentation — with no test flows written yet (infrastructure only).

**Architecture:** Maestro is a standalone CLI (not an npm package) that runs
YAML flows against an app already installed on a simulator/emulator. This
project uses `expo-dev-client` + `expo run:ios` / `expo run:android` to
produce that installed build locally, no EAS account required. Flows will
live in `.maestro/` at the repo root (Maestro's default discovery path,
outside `src/` like other tooling config).

**Tech Stack:** Expo SDK 57 (managed, now dev-client-capable), Maestro CLI
(external binary), pnpm.

**Spec:** [docs/superpowers/specs/2026-08-21-maestro-e2e-setup-design.md](../specs/2026-08-21-maestro-e2e-setup-design.md)

## Global Constraints

- English only in code, identifiers, and `AGENTS.md`/root `README.md`
  structural headings; **Portuguese prose** in `.maestro/README.md` body text
  per AGENTS.md Rule 3 (module README carve-out) — code identifiers and paths
  inside it stay in English.
- No magic strings: npm script names and the `.maestro` path are the values
  being introduced here, not values to further extract.
- No test flows (`.maestro/*.yaml`) are in scope — infrastructure only, per
  the spec's explicit scope.
- No CI wiring — local-only for now, per the spec.
- This environment (WSL2) has no Xcode, Android SDK, or Maestro CLI
  installed. Verification in this session is limited to `pnpm install`,
  `pnpm typecheck`, and `pnpm lint`. Actually building the dev client and
  running `maestro test` is out of scope for this session's verification.

---

### Task 1: Add `expo-dev-client` and E2E npm scripts

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: npm scripts `e2e:build:ios`, `e2e:build:android`, `test:e2e`,
  referenced by `.maestro/README.md` (Task 2) and root `README.md` (Task 3).

- [ ] **Step 1: Install `expo-dev-client` with an SDK-matched version**

Run:
```bash
pnpm exec expo install expo-dev-client
```

Expected: command exits 0, `package.json` gains an `expo-dev-client` entry
under `"dependencies"` (Expo's installer places it there, not
`devDependencies` — this matches how Expo treats all `expo-*` packages,
since they're part of the runtime the dev client build compiles in), and
`pnpm-lock.yaml` is updated.

- [ ] **Step 2: Add the E2E scripts to `package.json`**

In the `"scripts"` block, after `"test:ci": "jest --ci"`, add:

```json
    "e2e:build:ios": "expo run:ios",
    "e2e:build:android": "expo run:android",
    "test:e2e": "maestro test .maestro"
```

- [ ] **Step 3: Verify**

Run:
```bash
pnpm typecheck
pnpm lint
```
Expected: both exit 0 (no regressions from the `package.json` change).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: add expo-dev-client and Maestro E2E npm scripts"
```

---

### Task 2: Create `.maestro/README.md`

**Files:**
- Create: `.maestro/README.md`

**Interfaces:**
- Consumes: npm scripts `e2e:build:ios`, `e2e:build:android`, `test:e2e`
  from Task 1 (referenced in the commands shown to the reader).

- [ ] **Step 1: Write `.maestro/README.md`**

```md
# Testes E2E (Maestro)

Esta pasta contém os flows de teste end-to-end escritos em
[Maestro](https://maestro.mobile.dev/), rodando contra um build de dev
client instalado no simulador/emulador — não contra o Expo Go.

**Por que dev client, não Expo Go:** este repositório é um template que
outros projetos clonam e nos quais adicionam módulos com código nativo ao
longo do tempo. O Expo Go para de funcionar assim que qualquer módulo
precisa de um módulo nativo customizado; o dev client continua funcionando.

## Pré-requisitos

1. Instale o Maestro CLI (não é um pacote npm, é um binário separado):

   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```

   Confirme com `maestro --version`.
2. Para iOS: Xcode + um simulador configurado (macOS apenas).
3. Para Android: Android Studio + um emulador configurado (AVD).

## Rodando os testes

```bash
pnpm e2e:build:ios      # builda e instala o dev client no simulador iOS
pnpm e2e:build:android  # builda e instala o dev client no emulador Android
pnpm test:e2e           # roda todos os flows desta pasta contra o dev client já instalado
```

`e2e:build:*` só precisa rodar de novo quando código nativo mudar (nova
dependência com módulo nativo, mudança em `app.json`, etc). Para iterar em
flows, basta manter o dev client aberto e rodar `pnpm test:e2e` de novo.

## Convenção de seleção de elementos

O Maestro seleciona elementos por texto visível ou por `testID`. Prefira
texto visível sempre que possível. Adicione um `testID` a um componente
apenas quando o texto for ambíguo (botões de ícone, texto repetido na tela)
— não adicione `testID`s de forma especulativa. Quando precisar de um,
trate-o como qualquer outra string mágica: extraia para uma constante,
seguindo a [Regra 4 do AGENTS.md](../AGENTS.md#4-no-magic-strings-or-numbers).

## Convenção de nomenclatura dos flows

Ainda não há nenhum flow nesta pasta — é só infraestrutura por enquanto,
já que o app hoje só tem a tela `Home` e a autenticação está
pausada até o backend (em outro repositório) ficar pronto. Quando o
primeiro flow for escrito, nomeie o arquivo pelo fluxo que ele cobre em
`kebab-case` (`sign-in.yaml`, `edit-profile.yaml`), um flow por arquivo.
```

- [ ] **Step 2: Verify the file was created correctly**

Run:
```bash
test -f .maestro/README.md && echo "exists"
```
Expected: prints `exists`.

- [ ] **Step 3: Commit**

```bash
git add .maestro/README.md
git commit -m "docs: add Maestro E2E setup and conventions readme"
```

---

### Task 3: Update root `README.md`

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: npm scripts from Task 1; `.maestro/` folder from Task 2.

- [ ] **Step 1: Add `.maestro/` to the folder map**

Find this block (top of the "Estrutura de pastas" section):

```
App.tsx                 raiz: providers + navegação
global.css              ponto de entrada do Tailwind (importado por App.tsx)
biome.json              linter + formatter (substitui ESLint e Prettier)
tailwind.config.js      lê os tokens de src/theme/tokens.js
src/
```

Replace with:

```
App.tsx                 raiz: providers + navegação
global.css              ponto de entrada do Tailwind (importado por App.tsx)
biome.json              linter + formatter (substitui ESLint e Prettier)
tailwind.config.js      lê os tokens de src/theme/tokens.js
.maestro/               flows de teste E2E (Maestro) — só o README por enquanto
src/
```

- [ ] **Step 2: Add the E2E commands to the commands list**

Find this block:

```
pnpm test        # jest --watchAll
pnpm test:ci     # jest --ci
```

Replace with:

```
pnpm test        # jest --watchAll
pnpm test:ci     # jest --ci
pnpm e2e:build:ios      # builda e instala o dev client no simulador iOS
pnpm e2e:build:android  # builda e instala o dev client no emulador Android
pnpm test:e2e           # roda os flows do Maestro (.maestro/) no dev client já instalado
```

- [ ] **Step 3: Update the "Padrões" roadmap line to mention E2E infra**

Find this line inside the "Roadmap" section:

```
- [x] **Padrões** — Biome substitui ESLint/Prettier, pnpm, convenções do
      projeto em `AGENTS.md`, código só em inglês, README por módulo,
      sem strings ou números mágicos, testes unitários com jest-expo +
      React Native Testing Library.
```

Replace with:

```
- [x] **Padrões** — Biome substitui ESLint/Prettier, pnpm, convenções do
      projeto em `AGENTS.md`, código só em inglês, README por módulo,
      sem strings ou números mágicos, testes unitários com jest-expo +
      React Native Testing Library, infraestrutura de E2E com Maestro
      (sem flows ainda — veja `.maestro/README.md`).
```

- [ ] **Step 4: Verify**

Run:
```bash
grep -n "maestro" README.md -i
```
Expected: three matches — the folder map line, the commands block, and the
roadmap line.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document Maestro E2E setup in root README"
```

---

### Task 4: Update `AGENTS.md` Rule 8

**Files:**
- Modify: `AGENTS.md:173-203` (the `## 8. Tests` section)

**Interfaces:**
- Consumes: npm scripts from Task 1; `.maestro/README.md` from Task 2.

- [ ] **Step 1: Update the intro line to drop the "no E2E yet" note**

Find:

```
Tests use **jest-expo** (Jest, configured for Expo/React Native) plus
**React Native Testing Library** for components. No Detox/Maestro (E2E) yet.
```

Replace with:

```
Tests use **jest-expo** (Jest, configured for Expo/React Native) plus
**React Native Testing Library** for components, and **Maestro** for E2E
flows against a dev client build.
```

- [ ] **Step 2: Add an E2E subsection after the existing `pnpm test` block**

Find the end of the section:

```
`pnpm test` is intentionally **not** part of `pnpm check` — typecheck and
lint stay the fast pre-commit gate; run tests on demand or in CI.
```

Append immediately after it:

```

### E2E (Maestro)

Flows live in `.maestro/` at the repo root — Maestro's default discovery
location, kept outside `src/` since it isn't module code (same reasoning as
`biome.json` or `metro.config.js` living at root). See
[`.maestro/README.md`](.maestro/README.md) for prerequisites, how to build
the dev client, and how to run flows.

- Maestro requires a **dev client build** (`expo-dev-client`), not Expo Go —
  once any module adds custom native code, Expo Go stops working for E2E
  while the dev client keeps working.
- Elements are selected by visible text or `testID`. Add a `testID` constant
  (see [Rule 4](#4-no-magic-strings-or-numbers)) only when text selection is
  ambiguous (icon buttons, repeated text) — don't add them speculatively.

```bash
pnpm e2e:build:ios      # build + install the dev client on the iOS simulator
pnpm e2e:build:android  # build + install the dev client on the Android emulator
pnpm test:e2e           # run every flow in .maestro/ against the installed dev client
```

No flows exist yet — the app currently has only a single `Home` screen
and no auth backend to test against.
```

- [ ] **Step 3: Verify**

Run:
```bash
pnpm lint
grep -n "Maestro" AGENTS.md
```
Expected: `pnpm lint` exits 0; `grep` shows matches in both the updated
intro line and the new "E2E (Maestro)" subsection.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document Maestro E2E convention in AGENTS.md Rule 8"
```

---

## Out of scope (unchanged from spec)

- Writing `.maestro/*.yaml` flows.
- Adding `testID`s to existing components.
- CI integration.
- EAS / cloud builds.
