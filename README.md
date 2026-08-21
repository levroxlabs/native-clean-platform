# React Native Boilerplate

Base reutilizável para apps React Native. **Isto não é um app finalizado** — é
o ponto de partida que outros projetos clonam.

**Stack:** Expo SDK 57 (managed) · React Native 0.86 · TypeScript · NativeWind v4
(Tailwind 3.4) · React Navigation 7 · Biome · pnpm

**Status:** estrutura, ferramentas e convenções prontas. Ainda sem
autenticação — o backend com o qual o app vai conversar está em um
repositório separado e ainda não está pronto.

> As convenções de código estão em **[AGENTS.md](AGENTS.md)** — leia antes de contribuir.

---

## Começando

Requer pnpm. Se você não tem: `corepack enable pnpm`.

```bash
pnpm install
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
nova pasta em `src/modules/`, autocontida. Todo módulo tem seu próprio
`README.md` documentando o que ele exporta.

```
App.tsx                 raiz: providers + navegação
global.css              ponto de entrada do Tailwind (importado por App.tsx)
biome.json              linter + formatter (substitui ESLint e Prettier)
tailwind.config.js      lê os tokens de src/theme/tokens.js
.maestro/               flows de teste E2E (Maestro) — só o README por enquanto
src/
  components/           componentes compartilhados entre módulos (vazio por enquanto)
  screens/               telas que não pertencem a nenhum módulo específico
  navigation/            React Navigation: stack, constantes de rota, tipos de parâmetros
  modules/               vazio por enquanto — um novo módulo é uma nova pasta aqui
  theme/                 design tokens (fonte única da verdade)
  utils/                 helpers puros (cn, formatadores)
```

`src/hooks/`, `src/services/` e `src/store/` só são criados quando algo
realmente precisar deles — veja [AGENTS.md](AGENTS.md) para saber o propósito
de cada um.

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
import { colors, px, spacing } from '@/theme';

<ActivityIndicator color={colors.brand[500]} size={px(spacing[6])} />;
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

Nenhuma tela precisa ser tocada.

---

## Decisões e porquês

- **Biome, não ESLint + Prettier.** Um binário, uma config, um passe — sem
  matriz de plugins para manter sincronizada entre os apps que clonam este
  repo. Também aplica duas das nossas convenções diretamente: componentes
  como arrow function e nenhum número mágico.
- **pnpm com `node-linker=hoisted`.** O Metro não segue de forma confiável os
  `node_modules` simbólicos do pnpm, então o `.npmrc` força um layout plano em
  disco. Mantenha essa linha se migrar para um monorepo.
- **NativeWind v4 + Tailwind 3.4**, não o preview do NativeWind v5: v4 é a
  versão estável e mantém `tailwind.config.js` em JS, que é o que permite os
  tokens virem de um arquivo compartilhado. O Tailwind v4 move os tokens para
  `@theme` no CSS.
- **React Navigation**, não Expo Router: rotas explícitas e tipadas em
  `src/navigation/`, sem acoplar a estrutura de pastas à navegação.
- **`noUncheckedIndexedAccess`** ligado: acesso indexado retorna
  `T | undefined`. Mais rígido, e pega bugs reais de acesso a array/record.
- **Sem ordenação de classes Tailwind.** O `useSortedClasses` do Biome ainda é
  um trabalho em andamento e não entende utilitários customizados, então
  brigaria com nossos tokens semânticos. Revisitar quando a regra estabilizar.

---

## Estado atual da navegação

`src/navigation/RootNavigator.tsx` renderiza um único stack (`AppStack`) com
uma tela placeholder, ali para provar que navegação, NativeWind e os tokens
funcionam de ponta a ponta. Quando a autenticação for implementada, a raiz vai
escolher entre um stack logado e um deslogado com base no estado da sessão.

---

## Roadmap

- [x] **Setup** — Expo + TS, NativeWind + tokens, estrutura de pastas,
      React Navigation, README.
- [x] **Padrões** — Biome substitui ESLint/Prettier, pnpm, convenções do
      projeto em `AGENTS.md`, código só em inglês, README por módulo,
      sem strings ou números mágicos, testes unitários com jest-expo +
      React Native Testing Library, infraestrutura de E2E com Maestro
      (sem flows ainda — veja `.maestro/README.md`).
- [ ] **Auth** — contra a API própria do projeto, desenvolvida em um repo
      separado e ainda não pronta: cliente HTTP, `useAuth()`, `AuthProvider`,
      `expo-secure-store`, refresh de token, telas de sign-in / sign-up,
      navegação condicional. Implementado como um módulo em
      `src/modules/auth/` quando a API estiver pronta.
- [ ] **Polimento** — estados de erro e loading, validação de formulário,
      variáveis de ambiente, guia de adoção do boilerplate.
