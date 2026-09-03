# React Native Boilerplate

Base reutilizável para apps React Native. **Isto não é um app finalizado** — é
o ponto de partida que outros projetos clonam.

**Stack:** Expo SDK 57 (managed) · React Native 0.86 · TypeScript · NativeWind v4
(Tailwind 3.4) · React Navigation 7 · TanStack Query 5 · axios ·
react-hook-form + zod · expo-secure-store · Biome · pnpm

**Status:** estrutura, ferramentas e convenções prontas, mais o módulo `auth`
implementado contra os três endpoints de `/auth` de `api-clean-platform`:
cadastro, login, restauração da sessão no boot, logout e gate de navegação.
Refresh de token e logout no servidor ficam de fora porque a API ainda não tem
esses endpoints.

> **Convenções de código** (como escrever) estão em **[AGENTS.md](AGENTS.md)**.
> **Arquitetura** (o que existe, fronteiras entre módulos, decisões travadas e
> o que ainda falta) está em **[ARCHITECTURE.md](ARCHITECTURE.md)**. Leia os
> dois antes de contribuir.

---

## Começando

Requer pnpm. Se você não tem: `corepack enable pnpm`.

```bash
pnpm install
cp .env.example .env    # e ajuste EXPO_PUBLIC_API_URL se a API não estiver em localhost:3000
pnpm start          # Metro — conecta ao dev client (requer build prévio, veja abaixo)
pnpm android        # abre no emulador/dispositivo Android (requer dev client instalado)
pnpm ios            # abre no simulador iOS (somente macOS; requer dev client instalado)
pnpm web            # abre no navegador
```

Como `expo-dev-client` é uma dependência do projeto, `pnpm start`/`android`/`ios`
não abrem mais o Expo Go — é preciso instalar o dev client uma vez
(`pnpm e2e:build:ios` ou `pnpm e2e:build:android`, veja
[`.maestro/README.md`](.maestro/README.md)) antes de rodar esses comandos.

Checagens de qualidade:

```bash
pnpm check              # typecheck + lint — rode antes de cada commit
pnpm typecheck          # tsc --noEmit
pnpm lint               # biome check
pnpm lint:fix           # biome check --write (correções seguras)
pnpm format             # biome format --write
pnpm test               # jest --watchAll
pnpm test:ci            # jest --ci
pnpm e2e:build:ios      # builda e instala o dev client no simulador iOS
pnpm e2e:build:android  # builda e instala o dev client no emulador Android
pnpm test:e2e           # roda os flows do Maestro (.maestro/) no dev client já instalado
```

---

## Estrutura de pastas

Organizado **por módulo, não por tipo de arquivo**. Um novo módulo é uma
nova pasta autocontida em `src/modules/`, com sua própria API pública,
telas, componentes e hooks. Todo módulo tem seu próprio `README.md`
documentando o que ele exporta — veja
[`src/modules/README.md`](src/modules/README.md) para o detalhamento
completo das convenções.

```
App.tsx              raiz: providers + navegação
biome.json            linter + formatter (substitui ESLint e Prettier)
tailwind.config.js    lê os tokens de src/theme/tokens.js
.maestro/             flows de teste E2E (Maestro)
src/
  components/          compartilhados entre módulos (vazio por enquanto)
  screens/              telas sem módulo próprio
  navigation/           React Navigation: stack, rotas, tipos de parâmetro
  modules/              um módulo por pasta — veja src/modules/README.md
  theme/                design tokens (fonte única da verdade)
  utils/                helpers puros (cn, formatadores)
```

Nada fora de um módulo importa um arquivo de dentro dele — só o que o
`index.ts` exporta — e módulos não importam uns aos outros. Código
compartilhado sobe para `src/components/` (a partir do segundo consumidor)
ou para um módulo de topo como `src/hooks/`, `src/lib/` ou
`src/store/`, criados apenas quando algo realmente precisar deles — veja
[AGENTS.md](AGENTS.md) para o propósito de cada um.

A árvore completa de hoje, com o papel de cada arquivo, e a tabela da regra
de fronteira entre módulos estão em [ARCHITECTURE.md](ARCHITECTURE.md),
seção 2.

---

## Design tokens

`src/theme/tokens.js` é a **fonte única da verdade**. É CommonJS de propósito:
o mesmo arquivo alimenta o `tailwind.config.js` (Node) e o código TypeScript
(através de `src/theme/index.ts`, tipado por `tokens.d.ts`), então um token
nunca diverge entre os dois.

Os valores são strings CSS (`'16px'`) porque o NativeWind compila Tailwind
para CSS antes de converter para estilos nativos. Para usar um token fora do
Tailwind:

```ts
import { colors, parsePixels, spacing } from '@/theme';

<ActivityIndicator color={colors.brand[500]} size={parsePixels(spacing[6])} />;
```

### Cores brutas vs. semânticas

Prefira os aliases semânticos nas telas:

| Use isto                             | Em vez disto          |
| ------------------------------------ | -------------------- |
| `bg-background`, `bg-surface`        | `bg-neutral-50`      |
| `text-content`, `text-content-muted` | `text-neutral-900`   |
| `bg-primary`                         | `bg-brand-500`       |
| `border-border`                      | `border-neutral-200` |

Dark mode e rebranding acontecem então em um único lugar (`semanticColors`).

### Adaptando para um novo app

1. Substitua a escala `colors.brand` em `src/theme/tokens.js`.
2. Revise `semanticColors` se a marca precisar de superfícies ou contraste diferentes.
3. Para uma fonte customizada: carregue com `expo-font`, depois defina `typography.fontFamily.sans`.
4. Atualize `name` e `slug` em `app.json`, e `name` em `package.json`.

Nenhuma tela precisa ser tocada. O porquê de `tokens.js` ser CommonJS e a
regra de estilização (só NativeWind, sem `StyleSheet`) estão detalhados em
[ARCHITECTURE.md](ARCHITECTURE.md), seção 5.

---

## Decisões e porquês

As decisões travadas — por que Biome em vez de ESLint + Prettier, por que
pnpm com `hoisted`, por que NativeWind v4 e não v5, por que React Navigation
e não Expo Router, `noUncheckedIndexedAccess`, sem ordenação de classes
Tailwind — e o porquê de cada uma vivem em
[ARCHITECTURE.md](ARCHITECTURE.md), seção 9. Mantidas só lá para não haver
duas explicações que possam divergir.

---

## Estado atual da navegação

Ver [ARCHITECTURE.md](ARCHITECTURE.md), seção 6 — o composition root que lista
módulos em vez de telas, e o gate que escolhe entre o stack logado e o
deslogado.

---

## Roadmap

> O que falta implementar é rastreado aqui como progresso; o mesmo conteúdo
> aparece em [ARCHITECTURE.md](ARCHITECTURE.md), seção 10, como um registro de
> "isto não existe ainda, não é omissão" — os dois têm propósitos diferentes,
> mas descrevem a mesma lacuna.

- [x] **Setup** — Expo + TS, NativeWind + tokens, estrutura de pastas,
      React Navigation, README.
- [x] **Padrões** — Biome substitui ESLint/Prettier, pnpm, convenções do
      projeto em `AGENTS.md`, código só em inglês, README por módulo,
      sem strings ou números mágicos, testes unitários com jest-expo +
      React Native Testing Library, infraestrutura de E2E com Maestro
      (sem flows ainda — veja `.maestro/README.md`).
- [x] **Auth** — módulo em `src/modules/auth/` contra `api-clean-platform`:
      cliente HTTP (axios) em `src/lib/`, `useAuth()` / `AuthProvider`,
      token no `expo-secure-store`, telas de sign-in / sign-up com validação,
      e navegação condicional entre o stack logado e o deslogado. Refresh de
      token e logout no servidor ficam adiados até a API publicar os
      endpoints — o único ponto a mudar é `configureAuthorization`.
- [ ] **Polimento** — guia de adoção do boilerplate.
