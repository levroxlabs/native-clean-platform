# Arquitetura

Documentação do que **existe neste repositório**. Nada aqui é plano ou intenção —
se está escrito, está construído e verificável rodando os comandos da §9.

Este é o único documento de arquitetura versionado. `docs/superpowers/` guarda
specs e planos de decisões pontuais já tomadas — são referência complementar,
não substituem este arquivo.

**Stack hoje:** Expo SDK 57 (managed) · React Native 0.86 · TypeScript 6 ·
NativeWind v4 (Tailwind 3.4) · React Navigation 7 · TanStack Query 5 · axios ·
react-hook-form 7 + zod 4 · expo-secure-store · @react-native-community/netinfo ·
Jest (jest-expo) +
React Native Testing Library · Maestro · Biome · pnpm

---

## 1. O princípio

> **Nada fora de um módulo importa um arquivo de dentro dele.**

Um módulo (`src/modules/<name>/`) expõe sua superfície pública inteira através
de um único `index.ts`. Todo o resto — telas, hooks, chamadas de API,
componentes internos — é implementação, e implementação não se importa de
fora. Módulos também não se importam entre si: código que mais de um módulo
precisa sobe para `src/components/` (a partir do segundo consumidor) ou para
um módulo de topo — `src/hooks/`, `src/lib/`, `src/store/` — criado
quando algo realmente precisar dele, não antes.

Este repositório é **front-end only**. O backend com o qual o app conversa
mora num repositório separado (`api-clean-platform`) — nunca entra aqui
código de servidor, banco ou emissão de token. É por isso que este documento
não tem seção de banco de dados, taxonomia de erro de domínio ou camada de
infra: nada disso é responsabilidade deste lado da fronteira.

Hoje existe **um módulo**, `auth` (§2), construído contra os três endpoints
de `/auth` de `api-clean-platform`. Ele é a referência de formato para o
próximo: é o `index.ts` dele que define o que o resto do app enxerga, e foi
ele que forçou à existência os dois módulos de topo que faltavam —
`src/config/` e `src/lib/`.

---

## 2. A árvore

```text
App.tsx                    raiz: providers (gesture handler, safe area, status bar) + navegação
index.ts                   registerRootComponent — entrypoint do Expo
global.css                  entrada do Tailwind, importada por App.tsx
biome.json                  linter + formatter (substitui ESLint e Prettier)
tailwind.config.js          lê os tokens de src/theme/tokens.js
tsconfig.json               extends expo/tsconfig.base — strict, noUncheckedIndexedAccess, alias @/
pnpm-workspace.yaml         settings do pnpm — pnpm 11 não lê mais .npmrc (§9)
jest.setup.ts               EXPO_PUBLIC_* de teste + keychain em memória (mock de expo-secure-store)
.env.example                EXPO_PUBLIC_API_URL — copie para .env antes de rodar
.maestro/                   flows de teste E2E (Maestro) — só o README por enquanto
docs/superpowers/           specs e planos das decisões já tomadas (testes unitários, E2E)
src/
├── components/             componentes compartilhados por mais de um módulo — vazio por enquanto
│   ├── index.ts             (sem exports ainda)
│   └── README.md
├── config/                  variáveis de ambiente, validadas na carga
│   ├── env.ts               readApiBaseUrl() + API_BASE_URL — falha alto se faltar
│   ├── env.test.ts          colocado
│   ├── index.ts
│   └── README.md
├── errors/                   uma resposta só para "o que acontece quando algo falha"
│   ├── classify.ts          ERROR_KINDS + classifyError/isRetryable/shouldRetry
│   ├── copy.ts              mapa base + registro por módulo → a frase que o usuário lê
│   ├── reporter.ts          o seam entre o QueryCache.onError e o provider do toast
│   ├── ErrorBoundary.tsx    a ÚNICA classe do código (React exige) + a tela de fallback
│   ├── ErrorToast.tsx       context + provider + host, um slot só
│   ├── useErrorToast.ts     { showError }
│   ├── reporting.test.tsx   integração: query que falha chega ao toast
│   ├── index.ts
│   └── README.md
├── lib/                      I/O sem React — nem hook, nem contexto, nem componente
│   ├── api.ts               instância axios + 2 interceptors, request(), ApiError, API_ERROR_CODES
│   ├── api.test.ts          colocado — troca defaults.adapter para exercitar os interceptors
│   ├── connectivity.ts      NetInfo → onlineManager: sem isso o RN "está sempre online"
│   ├── index.ts             não reexporta a instância: de fora, só request()
│   └── README.md
├── screens/                 telas que não pertencem a nenhum módulo específico
│   ├── HomeScreen.tsx       o shell logado — prova navegação + NativeWind + tokens de ponta a ponta
│   ├── SplashScreen.tsx     só durante o boot, enquanto o token guardado é verificado
│   ├── index.ts
│   └── README.md
├── navigation/               composition root: lista módulos, não telas
│   ├── RootNavigator.tsx    splash enquanto a sessão é desconhecida, depois o NavigationContainer
│   ├── RootStack.tsx        um Stack.Screen por módulo — renderiza só o lado que a sessão escolhe
│   ├── RootNavigator.test.tsx  colocado — o gate nos três estados de sessão
│   ├── AppStack.tsx         o shell logado — hoje só HomeScreen
│   ├── types.ts             RootStackParamList/AppStackParamList — a única declaração dos nomes de rota
│   ├── index.ts
│   └── README.md
├── modules/                  um módulo hoje: auth
│   ├── auth/
│   │   ├── api/             authApi.ts + schemas.ts (respostas da API) + testes colocados
│   │   ├── components/      FormTextField.tsx, SubmitButton.tsx — internos deste módulo
│   │   ├── hooks/           useAuth.ts
│   │   ├── context/         AuthContext.tsx — o context E o provider no mesmo arquivo + teste
│   │   ├── navigation/      AuthStack.tsx, types.ts
│   │   ├── screens/         SignInScreen.tsx, SignUpScreen.tsx + testes colocados
│   │   ├── validations/     credentials.ts — schemas zod dos formulários + teste colocado
│   │   ├── storage.ts       keychain (expo-secure-store); storage.web.ts é o fallback web
│   │   ├── errorCopy.ts     code da API → copy; a message da API nunca vai para a tela
│   │   ├── api/schemas.ts   schemas das RESPOSTAS da API — validação de formulário é validations/
│   │   ├── constants.ts, types.ts, index.ts
│   │   └── README.md
│   └── README.md             convenção do formato de módulo
├── theme/                    design tokens — fonte única da verdade
│   ├── tokens.js             CommonJS: alimenta tailwind.config.js (Node) e o TS (via index.ts)
│   ├── tokens.d.ts           tipagem do tokens.js
│   ├── index.ts              reexporta tokens + parsePixels() para o código do app
│   └── README.md
└── utils/                    helpers puros, sem React e sem I/O
    ├── cn.ts                 clsx + tailwind-merge — merge de classNames condicional
    ├── cn.test.ts            colocado
    ├── index.ts
    └── README.md
```

Cada pasta em `src/` — e cada módulo dentro de `src/modules/` — tem seu
próprio `README.md`, que é a documentação simplificada do que aquela pasta
exporta. É onde `Components` / `Hooks` / `Functions` / `Constants` de cada
uma estão listados; este documento não repete esse inventário, só o formato
e as regras que atravessam pastas.

### A regra de fronteira entre módulos

| Quem | Pode importar |
|---|---|
| arquivo dentro de `src/modules/<m>/**` | qualquer arquivo do mesmo módulo |
| qualquer arquivo fora de `src/modules/<m>/` | só o que `src/modules/<m>/index.ts` exporta |
| `src/modules/<m>/**` | nunca `src/modules/<outro>/**` |
| `src/lib/**` | nada de React e nada de módulo — só rede, storage e afins |
| `src/errors/**` | pode importar de `src/lib/`; nunca o contrário, e nunca um módulo |
| `src/config/**` | nada além do ambiente; é folha, não importa ninguém |

Um componente só sai de dentro de um módulo para `src/components/` quando um
**segundo** módulo passa a precisar dele — antes disso, mover é especulação.

**Sem lint nem dependency-cruiser checando isso hoje.** Diferente do repo da
API, que já tem uma tabela de fronteira equivalente pronta para o dia em que
o lint de fronteira entrar, aqui a regra é convenção pura, sustentada em
review.

`components/`, assim como `modules/<m>/components/`, começa **flat** (um
arquivo por componente). Subpastas por categoria (`ui/`, `layout/`,
`feedback/`) só valem a pena quando categorias distintas ficam visíveis ali
dentro — não se cria essa divisão antecipadamente.

---

## 3. Imports

`@/` aponta para `src/` — declarado em `tsconfig.json`
(`paths: { "@/*": ["./src/*"] }`) e resolvido pelo Metro através do preset
Babel do Expo. Nunca escrever `../../`.

Diferente do repo da API, aqui **não há passo de build** separando `src/` de
`dist/`: o Metro compila TypeScript direto de `src/` para o bundle, tanto em
desenvolvimento quanto no build de produção. Não existe, portanto, a
pegadinha de servir código compilado velho por esquecer uma flag de runtime —
não há `dist/` para divergir de `src/`.

---

## 4. Regras com dente

Regra que não é verificada por máquina é combinado, e combinado não sobrevive
a N projetos derivados. Estas falham em `pnpm check`:

| Regra | Mecanismo | Verificado |
|---|---|---|
| Componente é sempre arrow function | Biome `nursery/useReactFunctionComponentDefinition` (`namedComponents: arrowFunction`) | ✅ `pnpm lint` |
| Função-expressão é sempre arrow function, nunca `function (...) {}` | Biome `style/useArrowFunction` (regra estável do preset `recommended`) | ✅ `pnpm lint` |
| Sem número mágico | Biome `style/noMagicNumbers`, com exceção em `**/*.test.ts`/`**/*.test.tsx` | ✅ `pnpm lint` |
| Tipo em PascalCase; variável/const em `camelCase`, `PascalCase` ou `CONSTANT_CASE` | Biome `style/useNamingConvention`, com exceção em `src/theme/tokens.js` | ✅ `pnpm lint` |
| Acesso indexado devolve `T \| undefined` | `tsconfig.json`: `noUncheckedIndexedAccess` | ✅ `pnpm typecheck` |
| `@tailwind` não dispara at-rule desconhecida | Biome override `noUnknownAtRules: off` em `**/*.css` | ✅ evita falso positivo |

**O que ainda depende só de revisão humana:**

| Regra | Situação |
|---|---|
| Fronteira entre módulos (§2) | ⚠️ catch em review — nada de lint checa isso |
| String mágica (Biome só cobre número) | ⚠️ catch em review |
| Declaração de função nomeada (`function foo() {}`, em vez de expressão) | ⚠️ Biome cobre expressão, não declaração |
| Ordenação de classes Tailwind | ⚠️ desligada de propósito — `useSortedClasses` ainda é *work in progress* e não entende os tokens semânticos (§5); revisitar quando a regra estabilizar |

### Legal / não legal

| ✅ | ❌ |
|---|---|
| `export const Button = (props: ButtonProps) => …` | `export function Button(props: ButtonProps) { … }` |
| `navigation.navigate('Home')`, declarado em `AppStackParamList` | Um nome de rota que não está na lista de parâmetros — o `tsc` recusa |
| `const REQUEST_TIMEOUT_MS = 5000` | `5000` solto no meio do código |
| `bg-primary`, `text-content-muted` (semântico) | `bg-brand-500`, `text-neutral-900` (bruto) |
| `import { X } from '@/theme'` | `import { X } from '../../theme'` |
| `class ErrorBoundary extends Component` | Um boundary "funcional" — `getDerivedStateFromError` não existe como hook |
| Dependência de app cravada em `~`/`^` (padrão Expo) | Editar manualmente uma versão fora do que `expo install` resolveria |

---

## 5. Tema e estilização

`src/theme/tokens.js` é a **fonte única da verdade**, e é CommonJS de
propósito: o mesmo arquivo alimenta `tailwind.config.js` (Node) e o código
TypeScript, via `src/theme/index.ts` tipado por `tokens.d.ts` — um token
nunca diverge entre os dois lados.

Os valores são strings CSS (`'16px'`), não números: o NativeWind compila
Tailwind para CSS antes de converter para estilos nativos, e um número solto
não é CSS válido. Para usar um token fora do NativeWind (uma cor de
`ActivityIndicator`, por exemplo), `parsePixels()` converte de volta para o
número que a API nativa espera.

### Cores brutas vs. semânticas

| Use isto | Em vez disto |
|---|---|
| `bg-background`, `bg-surface` | `bg-neutral-50` |
| `text-content`, `text-content-muted` | `text-neutral-900` |
| `bg-primary` | `bg-brand-500` |
| `border-border` | `border-neutral-200` |

Dark mode e rebranding acontecem então num único lugar (`semanticColors`, em
`tokens.js`) — nenhuma tela precisa ser tocada.

### `cn()` e a regra de estilização

`src/utils/cn.ts` combina `clsx` (junção condicional) com `tailwind-merge`
(resolve conflito — `cn('p-2', 'p-4')` → `'p-4'`). É o que todo componente
que aceita uma prop `className` usa para deixar quem o consome ajustar layout
sem `View`s extras.

**Só classes NativeWind — nada de `StyleSheet.create` ou objeto de estilo
inline**, a menos que uma API force isso. A única exceção hoje é
`App.tsx:10`: `GestureHandlerRootView` precisa de um objeto de estilo real
porque o NativeWind não alcança essa prop —
`const ROOT_STYLE = { flex: 1 } as const`, extraído para não repetir um
objeto literal solto no JSX.

---

## 6. Navegação

**React Navigation**, não Expo Router: rotas explícitas e tipadas em
`src/navigation/`, sem acoplar a estrutura de pastas à navegação. Toda a
navegação vive ali e em nenhum outro lugar.

`src/navigation/` é um **composition root**: ele lista módulos, não telas.
`RootStack` tem um `Stack.Screen` por módulo, e as telas de cada módulo ficam
no navigator do próprio módulo (`src/modules/auth/navigation/AuthStack.tsx`).
Nomes de rota são literais no local de chamada — `<Stack.Screen name="Home">`,
`navigation.navigate('Home')`. Não há objeto de constantes: a lista de
parâmetros já é a única declaração de cada nome, e duplicá-la num `const object`
daria duas fontes para a mesma verdade sem ganhar checagem nenhuma.

`RootStackParamList` (em `types.ts`) é registrado globalmente:

```ts
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
```

É esse registro que faz `navigation.navigate()` ser tipado em qualquer lugar
do app sem precisar importar a lista de parâmetros manualmente. Cada entrada
usa `NavigatorScreenParams<...>`, que é o que mantém tipado um
`navigate('App', { screen: 'Home' })` aninhado.

**Adicionar uma tela são duas edições — no par do módulo dono dela:** uma
entrada na lista de parâmetros em `types.ts` e um `Stack.Screen` no navigator
daquele módulo. Esquecer a primeira quebra o `tsc` — não é convenção, é o
compilador. Adicionar um **módulo** novo toca o `navigation/` dele mais uma
linha em `types.ts` e outra em `RootStack.tsx` aqui.

Nome de rota é PascalCase por convenção do React Navigation, e como agora são
chaves literais da lista de parâmetros, o `biome.json` libera `typeProperty` em
PascalCase para `**/navigation/types.ts` (§9).

### Estado atual

`RootNavigator` mostra o `SplashScreen` enquanto a sessão é desconhecida
(`AUTH_STATUSES.LOADING`) e só então monta o `NavigationContainer` — montar o
container durante o boot significaria montar um navigator cuja primeira tela
seria trocada em seguida.

`RootStack` renderiza **um lado só**: `AuthStack` quando deslogado, `AppStack`
quando logado. Renderizar só um lado, em vez de registrar os dois e navegar,
é o que deixa o botão voltar do Android sem histórico para retornar a uma tela
logada depois do logout.

O desenho é o da skill `modularizing-react-navigation` (`.claude/skills/`),
agora com código: `auth` é o primeiro módulo a ter seu próprio navigator.

---

## 7. Testes

**Jest**, via preset `jest-expo`, mais **React Native Testing Library** para
componentes, e **Maestro** para E2E contra um build de dev client.

- Tests são **colocados** — `cn.ts` + `cn.test.ts`, nunca numa pasta
  `__tests__/`. O sufixo `.test.ts`/`.test.tsx` não é só preferência de nome:
  é exatamente o que o override do Biome casa para isentar `noMagicNumbers`
  (§4) — um arquivo nomeado diferente (`.spec.tsx`, dentro de `__tests__/`)
  ainda roda como teste, mas perde a isenção em silêncio e quebra `pnpm lint`.
- Lógica pura (`src/utils/`, hooks, lógica de módulo) usa Jest puro —
  `describe`/`it`/`expect`, como em `cn.test.ts`.
- Componentes e telas usam `@testing-library/react-native`, testando
  comportamento observável pelo usuário — texto renderizado, estado de
  acessibilidade, `fireEvent`. **Nunca** teste de snapshot. Na versão
  instalada, `render()` e `fireEvent.*()` devolvem Promise e precisam de
  `await` — omitir produz uma falha confusa mais adiante, não um erro óbvio
  no ponto de chamada. Desenho completo em
  [`docs/superpowers/specs/2026-08-20-unit-testing-setup-design.md`](docs/superpowers/specs/2026-08-20-unit-testing-setup-design.md).

`pnpm test` **não** faz parte de `pnpm check` — typecheck e lint continuam
sendo o portão rápido de pré-commit; teste roda sob demanda ou em CI.

### E2E (Maestro)

Flows vivem em `.maestro/`, na raiz — local de descoberta padrão do Maestro,
fora de `src/` porque não é código de módulo (mesmo raciocínio de
`biome.json` ou `metro.config.js` na raiz).

- Exige um **build de dev client** (`expo-dev-client`), não Expo Go — a
  partir do momento em que qualquer módulo adiciona código nativo próprio, o
  Expo Go para de servir para E2E enquanto o dev client continua funcionando.
- Elementos são selecionados por texto visível ou `testID`. Um `testID` só
  entra quando a seleção por texto é ambígua (botão de ícone, texto
  repetido) — nunca especulativamente.
- **Nenhum flow existe ainda** — o app hoje só tem a tela `Home` e nenhum
  backend de auth para testar contra. Desenho completo em
  [`docs/superpowers/specs/2026-08-21-maestro-e2e-setup-design.md`](docs/superpowers/specs/2026-08-21-maestro-e2e-setup-design.md).

---

## 8. Comandos

```bash
pnpm install
pnpm start               # Metro — conecta ao dev client (requer build prévio)
pnpm android              # abre no emulador/dispositivo Android (requer dev client instalado)
pnpm ios                  # abre no simulador iOS (só macOS; requer dev client instalado)
pnpm web                  # abre no navegador
pnpm check                # typecheck + lint — rodar antes de cada commit
pnpm typecheck            # tsc --noEmit
pnpm lint                 # biome check
pnpm lint:fix             # biome check --write
pnpm format               # biome format --write
pnpm test                 # jest --watchAll
pnpm test:ci               # jest --ci
pnpm e2e:build:ios         # builda e instala o dev client no simulador iOS
pnpm e2e:build:android      # builda e instala o dev client no emulador Android
pnpm test:e2e              # roda os flows do Maestro contra o dev client já instalado
```

Como `expo-dev-client` é dependência do projeto, `pnpm start`/`android`/`ios`
não abrem mais o Expo Go — é preciso instalar o dev client uma vez
(`pnpm e2e:build:ios`/`:android`) antes de rodar esses comandos.

---

## 9. Versões e decisões travadas

**Dependências aqui usam `^`/`~`, não versão exata.** Diferente do repo da
API — que pina tudo exato para eliminar divergência entre apps clonados —
este repo segue o padrão do próprio Expo: a faixa `~57.x` acompanha o SDK
testado em conjunto, e é o que `expo install` resolveria. Editar uma versão
manualmente para fora dessa faixa é o que o `expo-doctor`/`expo install`
existem para prevenir.

**`pnpm-workspace.yaml`, não `.npmrc`.** O pnpm 11 deixou de ler `.npmrc`
para essas chaves; é ali que moram:
- `nodeLinker: hoisted` — o Metro não segue de forma confiável os
  `node_modules` simbólicos do pnpm, então o layout em disco precisa ser
  plano. Mantenha essa linha se este repo virar um monorepo.
- `enablePrePostScripts: true` — os módulos nativos do Expo dependem de
  scripts de `postinstall` rodando.
- `minimumReleaseAgeExclude` — a lista de pacotes Expo isentos da idade
  mínima de publicação que o pnpm passou a exigir por padrão (proteção contra
  pacote comprometido publicado há minutos); os pacotes do SDK testado juntos
  precisam ficar instaláveis imediatamente após o release.
- `allowBuilds: { unrs-resolver: true }` — script de build de um pacote
  específico, explicitamente permitido; por padrão o pnpm bloqueia scripts de
  build de dependências.

**`pnpm-workspace.yaml` não faz deste repo um monorepo** — é um pacote único;
o arquivo existe só porque é para onde essas configurações do pnpm se
mudaram.

**`packageManager: pnpm@11.22.0`** fixa a versão do pnpm via Corepack — mesmo
mecanismo do repo da API.

**NativeWind v4 + Tailwind 3.4, não o preview do NativeWind v5.** v4 é a
versão estável e mantém `tailwind.config.js` em JS, o que permite os tokens
virem de um arquivo compartilhado (§5). Tailwind v4 move os tokens para
`@theme` no CSS, o que quebraria essa fonte única.

**React Navigation, não Expo Router** — rotas explícitas e tipadas em
`src/navigation/`, sem acoplar a estrutura de pastas à navegação (§6).

**axios, não `fetch` à mão.** `baseURL`, timeout e cancelamento vêm da
instância, e os dois interceptors — bearer token na saída, tradução para
`ApiError` na volta — substituem o cliente que existia escrito à mão. O teste
colocado troca `defaults.adapter` em vez de forçar o adapter `fetch`: em React
Native o adapter padrão é o XHR, e testar contra outro seria testar uma pilha
de rede que o app não usa.

**O toast é componente nosso, não uma lib.** Nenhuma lib popular de toast do
React Native estiliza por `className` — todas usam `StyleSheet`/props — então
usar os tokens semânticos exigiria passar um componente de render customizado,
ou seja, escrever o visual do mesmo jeito **e** carregar a dependência. Sobra
para nós um slot, um timer e um fade.

**`Animated` do core, não Reanimated,** para esse fade de 200ms. O Reanimated
está instalado (o NativeWind v4 exige), mas usá-lo aqui traria o mock dele para
os testes do toast sem nada em troca: ele ganha o lugar em interação por gesto
a 60fps, não numa transição de opacidade.

**Nome de rota é literal, não constante** (§6), o que faz a lista de parâmetros
ser a única declaração de cada nome. Como esses nomes são PascalCase por
convenção do React Navigation, o `biome.json` libera `typeProperty` em
PascalCase para `**/navigation/types.ts` — mesma natureza da isenção do
`tokens.js`: a forma da chave é ditada pela biblioteca, não escolhida por nós.

**Biome, não ESLint + Prettier.** Um binário, uma config, um passe — sem
matriz de plugins para manter sincronizada entre os apps que clonam este
repo. Também é quem dá dente a duas convenções direto (§4): componente como
arrow function e nenhum número mágico.

**`noUncheckedIndexedAccess` ligado** — acesso indexado devolve
`T | undefined`. Mais rígido, e pega bugs reais de acesso a array/record.

---

## 10. O que ainda não existe

Listado para não ser confundido com omissão, sem detalhar o que não foi
construído:

refresh de token e logout no servidor (a API não tem os endpoints; enquanto
não tiver, um `401 INVALID_ACCESS_TOKEN` encerra a sessão e o logout é local —
o único ponto a mudar é `configureAuthorization`) · password reset ·
verificação de e-mail · componente compartilhado em `src/components/` (vazio —
nenhum segundo consumidor apareceu ainda) · `src/hooks/`, `src/store/`
(criados só quando algo precisar deles, §1) · telemetria e crash reporting
(nenhum sink: a camada de erros não reporta para lugar nenhum) · fila de toasts,
swipe para dispensar e boundary por tela (§6 da spec da camada de erros) · flow
de E2E no Maestro · fronteira de módulo verificada por lint/dependency-cruiser
(§2).
