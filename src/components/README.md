# Components

Primitivas de UI conhecidas de antemão como necessárias a **qualquer** app
clonado deste boilerplate — não "componentes compartilhados por mais de um
módulo" no sentido literal, já que hoje só existe o módulo `auth`. Essa é uma
exceção documentada à regra do segundo consumidor (ver `ARCHITECTURE.md` e a
Rule 5 do `AGENTS.md`): o "segundo consumidor" aqui é o próximo app, não o
próximo módulo deste repositório.

Duas subpastas desde o primeiro export, não uma organização especulativa:
`inputs/` e `forms/` são categorias genuinamente distintas (UI pura vs.
integração com uma lib de formulário) — o oposto do "começa flat" que ainda
vale para `modules/<m>/components/`. `FormErrorMessage` e `SubmitButton`
ficam soltos na raiz pelo mesmo princípio invertido: nenhum dos dois forma
uma categoria própria com só um export cada, então uma subpasta por
componente seria a divisão especulativa que a regra evita.

## Components

| Name | Description |
| ---- | ------------- |
| `FormErrorMessage` | Mensagem de erro de formulário: `message: string \| null`, não renderiza nada quando `null`. |
| `SubmitButton` | Botão de submit com estado de pending: troca o label por um spinner e desabilita via `isPending`. |
| `TextInput` | Primitiva base: label, `value`/`onChangeText` controlados, `error?`, `className`. Aceita qualquer prop nativa de `TextInput` via passthrough. |
| `EmailInput` | `TextInput` com teclado e autocomplete de e-mail fixados. |
| `PasswordInput` | `TextInput` com `secureTextEntry` e `variant: 'current' \| 'new'` — só o `autoComplete` muda entre os dois. |
| `CodeInput` | `TextInput` com teclado numérico e `one-time-code`; `digits` (o `maxLength`) vem de quem usa. |
| `FormField` | Liga um `Controller` do react-hook-form à primitiva certa, escolhida por `type`. `inputProps` é o escape hatch pra um campo sem componente próprio (ex.: token de reset). |

## Constants

| Name | Description |
| ---- | ------------- |
| `PASSWORD_VARIANTS` | `current` \| `new` — prop `variant` do `PasswordInput`. |
| `FORM_FIELD_TYPES` | `text` \| `email` \| `password` \| `newPassword` \| `code` — prop `type` do `FormField`. |

## Conventions

- **`inputs/` não sabe que react-hook-form existe.** Só `FormField`
  (`forms/`) importa a lib — uma primitiva com RHF embutido não serviria a um
  campo fora de um form (ex.: uma busca com estado local).
- **`type` e `variant` são passados como literal, não como a constante** —
  `<FormField type="password">`, não `type={FORM_FIELD_TYPES.PASSWORD}`. Os
  dois já são tipados com a union derivada da constante, então o `tsc` recusa
  um valor fora dela na hora — a mesma proteção que nome de rota já tem. A
  constante segue existindo pra quem lê o valor de volta (o `switch` dentro do
  `FormField`), só não pra quem está só autorando o valor num prop já tipado.
- **`label` continua vindo de um `COPY`**, ao contrário de `type`/`variant`:
  copy voltada ao usuário não tem union do `tsc` te protegendo, então a Rule 4
  do `AGENTS.md` vale sem exceção aqui.
- **`FormField.digits` é obrigatório só quando `type` é `code`**, e a
  violação lança em vez de assumir um valor — um campo de código sem
  `digits` é um erro de uso do componente, não um estado que a UI deveria
  absorver em silêncio.
- Os estilos de cada variante ficam em mapas indexados pela constante
  (`AUTO_COMPLETE_BY_VARIANT`), nunca em uma cadeia de ternários.
