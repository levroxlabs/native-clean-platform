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
| `AppStack`      | O shell logado. Adicione aqui as telas que não pertencem a um módulo. |

## Constants

| Name          | Description                                       |
| ------------- | --------------------------------------------------- |
| `ROOT_ROUTES` | Um nome por módulo, mais o shell logado.             |
| `APP_ROUTES`  | Nomes de rota do `AppStack`.                         |

## Types

| Name                 | Description                                                          |
| -------------------- | ---------------------------------------------------------------------- |
| `RootStackParamList` | Parâmetros das rotas de topo. Registrado globalmente para que `navigate()` seja tipado em todo lugar. |
| `AppStackParamList`  | Parâmetros de cada rota em `AppStack`.                                |
| `RootRoute`          | União derivada de `ROOT_ROUTES`.                                      |
| `AppRoute`           | União derivada de `APP_ROUTES`.                                       |

## Conventions

- Nomes de rota nunca são literais de string no local de chamada. Use as
  constantes: `navigation.navigate(APP_ROUTES.HOME)`.
- Adicionar uma tela significa três edições **dentro do trio do módulo dono
  dela**: uma rota em `constants.ts`, uma entrada na lista de parâmetros em
  `types.ts`, e um `Stack.Screen` no navigator. O TypeScript quebra o build se
  você esquecer alguma.
- `NavigatorScreenParams` é o que mantém um `navigate(ROOT_ROUTES.APP, { screen:
  APP_ROUTES.HOME })` tipado. Sem ele o `screen` aninhado não é verificado.

## Current state

`RootNavigator` mostra o `SplashScreen` enquanto a sessão é desconhecida
(`AUTH_STATUSES.LOADING`) e só então monta o `NavigationContainer`. O
`RootStack` renderiza **um lado só**: `AuthStack` quando deslogado, `AppStack`
quando logado. Renderizar só um lado — em vez de registrar os dois e navegar —
é o que deixa o botão voltar do Android sem histórico para retornar a uma tela
logada depois do logout.

Este módulo lista **módulos, não telas**. Adicionar uma tela a um módulo toca
apenas o `navigation/` daquele módulo. Adicionar um módulo novo toca o trio
dele mais uma linha em cada um dos três arquivos daqui.
