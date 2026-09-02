# Theme

Design tokens para o app inteiro. `tokens.js` é a fonte única da verdade e é
propositalmente CommonJS: o mesmo arquivo alimenta o `tailwind.config.js`
(Node) e o código TypeScript, então um token nunca diverge entre os dois.

`tokens.d.ts` tipa o arquivo JS; `index.ts` reexporta para o código do app.

## Constants

| Name             | Description                                                          |
| ---------------- | ---------------------------------------------------------------------- |
| `colors`         | Escalas brutas: `brand` e `neutral` (50→950), mais `success`, `warning`, `danger`, `info`. |
| `semanticColors` | Aliases por papel: `background`, `surface`, `content`, `primary`, `border`, `danger`, … |
| `spacing`        | Grid de 4pt, como strings CSS.                                        |
| `typography`     | `fontFamily`, `fontSize` (com line heights), `fontWeight`.            |
| `radius`         | Escala de border radius.                                              |

## Functions

| Name              | Description                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `parsePixels(value)` | Converte um token CSS (`'16px'`) para o número que as APIs nativas esperam (`16`). |

## Types

| Name     | Description                        |
| -------- | ------------------------------------ |
| `Tokens` | Formato do objeto de tokens inteiro. |

## Conventions

- Os valores são strings CSS (`'16px'`), não números: o NativeWind compila
  Tailwind para CSS antes de converter para estilos nativos, e números soltos
  não são CSS válido.
- As telas usam classes Tailwind, não estes exports. Importe daqui só quando
  uma API não passa pelo NativeWind — uma cor de `ActivityIndicator`, uma lib
  de gráficos.
- Prefira `semanticColors` a `colors` para que dark mode e rebranding fiquem
  em um único lugar.
- Um alias com o mesmo nome de uma escala sombreia a escala inteira no Tailwind,
  porque o `tailwind.config.js` espalha `semanticColors` depois de `colors`. É o
  caso de `danger`: `bg-danger` e `bg-danger-surface` existem, `bg-danger-500`
  não. Escolha o nome do alias com isso em mente.

## Adapting to a new app

1. Substitua a escala `colors.brand`.
2. Revise `semanticColors` se a marca precisar de superfícies ou contraste diferentes.
3. Para uma fonte customizada: carregue com `expo-font`, depois defina `typography.fontFamily.sans`.

Nenhuma tela precisa ser tocada.
