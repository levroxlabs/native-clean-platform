# Navigation

Setup do React Navigation: o stack, os nomes de rota e seus tipos de
parâmetro. A navegação vive aqui e em nenhum outro lugar — sem roteamento
baseado em pastas, então adicionar uma tela é sempre uma edição explícita
neste módulo.

## Components

| Name            | Description                                        |
| --------------- | ----------------------------------------------------- |
| `RootNavigator` | `NavigationContainer` que envolve o stack do app.      |
| `AppStack`      | As telas do app. Adicione novas telas aqui.            |

## Constants

| Name         | Description                    |
| ------------ | --------------------------------- |
| `APP_ROUTES` | Nomes de rota do `AppStack`.       |

## Types

| Name                | Description                                                          |
| ------------------- | ---------------------------------------------------------------------- |
| `AppStackParamList` | Parâmetros de cada rota em `AppStack`. Registrado globalmente para que `navigate()` seja tipado em todo lugar. |
| `AppRoute`          | União derivada de `APP_ROUTES`.                                       |

## Conventions

- Nomes de rota nunca são literais de string no local de chamada. Use as
  constantes: `navigation.navigate(APP_ROUTES.HOME)`.
- Adicionar uma tela significa três edições: uma rota em `constants.ts`, uma
  entrada na lista de parâmetros em `types.ts`, e um `Stack.Screen` em
  `AppStack.tsx`. O TypeScript quebra o build se você esquecer alguma.

## Current state

Stack único, sem gate de autenticação. Quando a auth for implementada, o
`RootNavigator` vai escolher entre um stack logado e um deslogado com base no
estado da sessão.
