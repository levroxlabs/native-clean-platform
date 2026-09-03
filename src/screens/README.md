# Screens

Telas que não pertencem a nenhum módulo específico. Uma tela é o componente
que uma rota renderiza; ela compõe componentes de módulos e não tem lógica
de negócio própria.

Telas de um módulo vivem em `src/modules/<name>/screens/`, e são
importadas pelo stack.

## Components

| Name         | Route             | Description                                              |
| ------------ | ----------------- | ---------------------------------------------------------- |
| `HomeScreen` | `Home` | Tela inicial. Oferece as duas saídas de sessão: sair deste aparelho e sair de todos. |

## Conventions

- Texto voltado ao usuário vive em um objeto `COPY` no topo do arquivo, nunca
  inline no JSX. Essa é a costura que o i18n vai substituir.
- **"Sair de todos" confirma antes; "sair" não.** O primeiro derruba aparelhos
  que não estão na mão de quem clicou, e é a única ação destrutiva da tela.
- **As duas saídas falham de formas diferentes, e a tela reflete isso.**
  `signOut` não rejeita por construção; `signOutEverywhere` rejeita e **mantém**
  a sessão, então a rejeição vai para `useErrorToast().showError` em vez de
  virar unhandled rejection.
- Os botões são `Pressable` com classes NativeWind, e **não** o `SubmitButton`
  do módulo `auth`: a regra 5 do `AGENTS.md` promove um componente para
  `src/components/` quando um **segundo módulo** precisa dele, e `src/screens/`
  não é módulo.
