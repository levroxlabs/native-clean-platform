# Modules

Organizado **por módulo, não por tipo de arquivo**. Cada pasta aqui é um
módulo autocontido — telas, hooks, chamadas de API, tipos — que expõe sua
superfície pública através de um `index.ts`.

```
modules/<name>/
  api/          chamadas ao backend deste módulo
  components/   componentes específicos deste módulo
  context/      os React Contexts deste módulo, cada um com seu provider
  hooks/        hooks específicos deste módulo
  navigation/   o navigator deste módulo e os tipos de parâmetro das suas rotas
  screens/      telas pertencentes a este módulo
  utils/        helpers puros deste módulo — sem React, sem I/O
  validations/  schemas de validação dos formulários deste módulo
  constants.ts  constantes compartilhadas dentro do módulo
  types.ts
  index.ts      o ÚNICO ponto de entrada que outros módulos podem importar
  README.md     obrigatório — veja AGENTS.md
```

## Modules

| Name   | Description                                                          |
| ------ | ---------------------------------------------------------------------- |
| `auth` | Sessão do app: cadastro, login, restauração no boot, logout e o estado que a navegação consulta. |

## Conventions

- Nada fora de um módulo importa um arquivo de dentro dele — só o que o
  `index.ts` exporta.
- Módulos não importam uns aos outros. Código compartilhado sobe para
  `src/components/` ou para um novo módulo de topo (`src/hooks/`,
  `src/lib/`) criado quando for realmente necessário.
- Um componente só sai de um módulo quando um **segundo** módulo precisa dele.
- Um Context e o provider dele moram no **mesmo arquivo**, dentro de
  `context/` — quem lê o context é só o hook, e quem preenche é só o provider.
  Um segundo context do módulo ganha outro arquivo na mesma pasta.
- `validations/` guarda os schemas dos **formulários** (zod, consumidos pelo
  react-hook-form). Schema de resposta da API não é validação de formulário:
  fica em `api/`, junto de quem parseia a resposta.
- `components/` de um módulo começa flat (um arquivo por componente). Só vale
  a pena introduzir subpastas por categoria (`ui/`, `layout/`, `feedback/` —
  o mesmo padrão de `src/components/`) se o módulo crescer o bastante para
  que categorias distintas fiquem visíveis ali dentro; não crie essa divisão
  antecipadamente.
- **`utils/` é para o módulo o que `src/utils/` é para o app: funções puras,
  sem React e sem I/O** — não confundir com `src/lib/`, que é sobre I/O com o
  mundo externo. Mesma regra de promoção das constantes: um helper nasce no
  `utils/` do módulo e só sobe para `src/utils/` quando um **segundo** módulo
  precisar dele.
