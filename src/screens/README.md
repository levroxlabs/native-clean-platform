# Screens

Telas que não pertencem a nenhum módulo específico. Uma tela é o componente
que uma rota renderiza; ela compõe componentes de módulos e não tem lógica
de negócio própria.

Telas de um módulo vivem em `src/modules/<name>/screens/`, e são
importadas pelo stack.

## Components

| Name         | Route             | Description                                              |
| ------------ | ----------------- | ---------------------------------------------------------- |
| `HomeScreen` | `APP_ROUTES.HOME` | Tela inicial com um texto centralizado. |

## Conventions

- Texto voltado ao usuário vive em um objeto `COPY` no topo do arquivo, nunca
  inline no JSX. Essa é a costura que o i18n vai substituir.
