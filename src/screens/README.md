# Screens

Telas que não pertencem a nenhum módulo específico. Uma tela é o componente
que uma rota renderiza; ela compõe componentes de módulos e não tem lógica
de negócio própria.

Telas de um módulo vivem em `src/modules/<name>/screens/`, e são
importadas pelo stack.

## Components

| Name         | Route             | Description                                              |
| ------------ | ----------------- | ---------------------------------------------------------- |
| `HomeScreen` | `Home` | Tela inicial. Leva à área de conta, que é onde vivem as saídas de sessão. |

## Conventions

- Texto voltado ao usuário vive em um objeto `COPY` no topo do arquivo, nunca
  inline no JSX. Essa é a costura que o i18n vai substituir.
- **As saídas de sessão não moram mais aqui.** Elas foram para a
  `AccountScreen`, no módulo `auth`, junto com a troca de senha — é onde o
  usuário procura por elas, e é onde a assimetria entre `signOut` e
  `signOutEverywhere` está documentada.
- Os botões são `Pressable` com classes NativeWind, e **não** o `SubmitButton`
  do módulo `auth`: a regra 5 do `AGENTS.md` promove um componente para
  `src/components/` quando um **segundo módulo** precisa dele, e `src/screens/`
  não é módulo.
