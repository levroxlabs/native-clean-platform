# Navigation

Setup do React Navigation: os stacks, os nomes de rota e seus tipos de
parâmetro. A navegação vive aqui e em nenhum outro lugar — sem roteamento
baseado em pastas, então adicionar uma tela é sempre uma edição explícita.

Este módulo lista **módulos, não telas**: as telas de um módulo ficam no
`navigation/` dele.

## Components

| Name            | Description                                                        |
| --------------- | -------------------------------------------------------------------- |
| `RootNavigator` | Mostra o `SplashScreen` enquanto a sessão é desconhecida e só então monta o `NavigationContainer`. |
| `RootStack`     | Um `Stack.Screen` por módulo. Renderiza só o lado que a sessão escolhe. |
| `AppStack`      | O shell logado: a `Home` mais o `AccountStack` do módulo `auth`, registrado como **uma** tela. |

## Types

| Name                 | Description                                                          |
| -------------------- | ---------------------------------------------------------------------- |
| `RootStackParamList` | Parâmetros das rotas de topo (`Auth`, `App`). Registrado globalmente para que `navigate()` seja tipado em todo lugar. |
| `AppStackParamList`  | Parâmetros de cada rota em `AppStack`.                                |

## Conventions

- Nomes de rota são **literais**: `<Stack.Screen name="Home">` e
  `navigation.navigate('Home')`. Não há objeto de constantes — a lista de
  parâmetros em `types.ts` é a única declaração de cada nome, e o `tsc` recusa
  qualquer nome que não esteja nela.
- Adicionar uma tela significa duas edições **dentro do par do módulo dono
  dela**: uma entrada na lista de parâmetros em `types.ts` e um `Stack.Screen`
  no navigator. Esquecer a primeira quebra o build.
- Nome de rota é PascalCase, por convenção do React Navigation. É por isso que
  o `biome.json` libera `typeProperty` em PascalCase para `**/navigation/types.ts`.
- `NavigatorScreenParams` é o que mantém um `navigate('App', { screen: 'Home' })`
  tipado. Sem ele o `screen` aninhado não é verificado. A rota `Account` usa o
  mesmo mecanismo: ela é o navigator inteiro do módulo `auth`, não uma tela.
- **A área de conta é um módulo, não duas telas soltas.** `Account` e
  `ChangePassword` são do `auth` — mexem em credencial e sessão — então o
  módulo exporta o `AccountStack` e o `AppStack` registra um `Stack.Screen` só,
  com `headerShown: false` para o stack de dentro não empilhar um segundo
  header. Registrar as duas telas direto aqui daria menos código e faria o
  `src/navigation/` importar arquivos de dentro do módulo, que é exatamente a
  fronteira que a regra 5 do `AGENTS.md` proíbe.

## Current state

`RootNavigator` mostra o `SplashScreen` enquanto a sessão é desconhecida
(`AUTH_STATUSES.LOADING`) e só então monta o `NavigationContainer`. O
`RootStack` renderiza **um lado só**: `AuthStack` quando deslogado, `AppStack`
quando logado. Renderizar só um lado — em vez de registrar os dois e navegar —
é o que deixa o botão voltar do Android sem histórico para retornar a uma tela
logada depois do logout.

Este módulo lista **módulos, não telas**. Adicionar uma tela a um módulo toca
apenas o `navigation/` daquele módulo. Adicionar um módulo novo toca o
`navigation/` dele mais uma linha aqui em `types.ts` e outra em `RootStack.tsx`.
