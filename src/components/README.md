# Components

Componentes de apresentação compartilhados por **mais de um** módulo.
Qualquer coisa usada por apenas um módulo pertence à pasta desse módulo até
que um segundo consumidor apareça.

Vazio por enquanto — ainda não há um componente usado por mais de um módulo.

Começa flat (um arquivo por componente, sem pasta própria por componente).
Quando crescer o bastante para precisar de categorias, organize em subpastas
funcionais — `ui/`, `layout/`, `feedback/` etc. — mantendo um arquivo por
componente dentro de cada uma.

Os componentes aqui são stateless em relação aos dados do app: recebem props,
não chamam hooks que buscam ou alteram dados. Aceitam uma prop `className`
mesclada via `cn()` para que quem os usa possa ajustar o layout sem `View`s
extras.

## Conventions

- Os estilos de cada variante ficam em mapas `Record<Variant, string>`
  indexados pela constante, nunca em uma cadeia de ternários.
- Todo componente interativo define `accessibilityRole` e `accessibilityState`.
