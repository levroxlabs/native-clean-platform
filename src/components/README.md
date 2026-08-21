# Components

Componentes de apresentação compartilhados por **mais de um** módulo.
Qualquer coisa usada por apenas um módulo pertence à pasta desse módulo até
que um segundo consumidor apareça.

Começa flat (um arquivo por componente, sem pasta própria por componente).
Quando crescer o bastante para precisar de categorias, organize em subpastas
funcionais — `ui/`, `layout/`, `feedback/` etc. — mantendo um arquivo por
componente dentro de cada uma.

Os componentes aqui são stateless em relação aos dados do app: recebem props,
não chamam hooks que buscam ou alteram dados. Aceitam uma prop `className`
mesclada via `cn()` para que quem os usa possa ajustar o layout sem `View`s
extras.

## Components

| Name     | Description                                                            |
| -------- | ---------------------------------------------------------------------- |
| `Button` | Pressable com variantes `primary` / `secondary` / `ghost`, estados de loading e disabled. |
| `Screen` | Container padrão de tela: insets de safe-area mais o fundo do tema.    |

## Constants

| Name              | Description                                                     |
| ----------------- | ----------------------------------------------------------------- |
| `BUTTON_VARIANTS` | Conjunto fechado de variantes do `Button`. Use em vez de strings soltas. |

## Types

| Name            | Description                             |
| --------------- | ---------------------------------------- |
| `ButtonVariant` | União derivada de `BUTTON_VARIANTS`.     |

## Conventions

- Os estilos de cada variante ficam em mapas `Record<Variant, string>`
  indexados pela constante, nunca em uma cadeia de ternários.
- Todo componente interativo define `accessibilityRole` e `accessibilityState`.
