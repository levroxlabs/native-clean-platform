# Modules

Organizado **por módulo, não por tipo de arquivo**. Cada pasta aqui é um
módulo autocontido — telas, hooks, chamadas de API, tipos — que expõe sua
superfície pública através de um `index.ts`.

```
modules/<name>/
  api/          chamadas ao backend deste módulo
  components/   componentes específicos deste módulo
  hooks/        hooks específicos deste módulo
  screens/      telas pertencentes a este módulo
  constants.ts  constantes compartilhadas dentro do módulo
  types.ts
  index.ts      o ÚNICO ponto de entrada que outros módulos podem importar
  README.md     obrigatório — veja AGENTS.md
```

## Modules

_Nenhum ainda._ Adicione um módulo criando uma pasta aqui que siga o
formato acima.

## Conventions

- Nada fora de um módulo importa um arquivo de dentro dele — só o que o
  `index.ts` exporta.
- Módulos não importam uns aos outros. Código compartilhado sobe para
  `src/components/` ou para um novo módulo de topo (`src/hooks/`,
  `src/services/`) criado quando for realmente necessário.
- Um componente só sai de um módulo quando um **segundo** módulo precisa dele.
- `components/` de um módulo começa flat (um arquivo por componente). Só vale
  a pena introduzir subpastas por categoria (`ui/`, `layout/`, `feedback/` —
  o mesmo padrão de `src/components/`) se o módulo crescer o bastante para
  que categorias distintas fiquem visíveis ali dentro; não crie essa divisão
  antecipadamente.
