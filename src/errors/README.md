# Errors

Uma resposta só para "o que acontece quando algo falha": classificação do erro,
a copy que o usuário lê, o error boundary de render e o toast global.

## Components

| Name | Description |
| ---- | ------------- |
| `ErrorBoundary` | Contém uma exceção de render e mostra uma tela de fallback com "tentar de novo". |
| `ErrorToastProvider` | Segura o toast e se registra como reporter global enquanto está montado. |

## Hooks

| Name | Description |
| ---- | ------------- |
| `useErrorToast()` | `{ showError }`. Lança se usado fora do `ErrorToastProvider`. |

## Functions

| Name | Description |
| ---- | ------------- |
| `classifyError(error)` | Devolve o `ErrorKind` do erro. |
| `isRetryable(error)` | `true` só para `offline` e `server`. |
| `shouldRetry(failureCount, error)` | No formato que a opção `retry` do TanStack Query espera. |
| `copyForError(error)` | A frase que o usuário lê, escolhida pelo `code`. |
| `registerErrorCopy(entries)` | Registra a copy de domínio de um módulo. Chamado pelo `App.tsx`. |
| `resetErrorCopy()` | Só para testes, para um registro não vazar de um arquivo para outro. |
| `configureErrorReporter(fn)` | Registra quem exibe o erro. `null` desregistra. |
| `reportError(error)` | Entrega o erro a quem estiver registrado. No-op se não houver ninguém. |

## Constants

| Name | Description |
| ---- | ------------- |
| `ERROR_KINDS` | `offline` \| `server` \| `input` \| `session` \| `unexpected`. |

## Conventions

- **`input` é qualquer 4xx que não seja erro de sessão**, e a ordem do teste
  importa: senha errada também é 401, e classificá-la como sessão responderia o
  erro mais comum do app com a copy mais genérica.
- **Query mostra toast, mutation não.** Uma query de fundo não tem call site
  para exibir a falha; um formulário já mostra o erro de submit inline, e
  repetir em toast diria a mesma coisa duas vezes. Uma query sai da regra com
  `meta: { silent: true }`; uma mutation entra com `meta: { toastOnError: true }`.
- **Erro de sessão nunca vira toast**, por nenhum caminho: o app já está levando
  o usuário para o login, e uma mensagem vermelha junto lê como uma segunda
  falha sem relação.
- **O reporter é um ponto de registro, não leitura de context.** O
  `QueryCache.onError` é configurado em escopo de módulo, onde context React não
  existe — mesma costura que o `AuthProvider` usa com `configureAuthorization`.
- **A copy de domínio é do módulo; o `App.tsx` registra.** Registrar como efeito
  colateral de import dependeria da ordem dos imports e de o arquivo ser mesmo
  importado — falha silenciosa e chata de testar. O preço é real: um módulo cuja
  copy nunca foi registrada cai no texto genérico **em silêncio**, e é por isso
  que os testes de tela do auth registram `AUTH_ERROR_COPY` no `beforeEach`.
- **O `ErrorBoundary` é classe**, e é exceção nomeada à regra 2 do `AGENTS.md`:
  `getDerivedStateFromError` não tem equivalente com hooks em nenhuma versão
  lançada do React.

## Limites aceitos

- **Um boundary só, na raiz.** Um crash de tela apaga o app inteiro, não só a
  tela. Preservar a navegação exigiria um segundo boundary dentro do navigator —
  fica para quando houver mais de um stack para preservar.
- **"Tentar de novo" só remonta.** Se o erro for determinístico, ele volta. É o
  que todo boundary faz; fingir o contrário seria pior.
- **Um slot, não fila.** Erro novo substitui o anterior. Erros em rajada quase
  sempre têm a mesma causa.
- **A dispensa é assíncrona.** A mensagem some no callback que encerra o fade,
  não no toque — um teste que afirme o contrário falha por motivo errado.

## Não existe ainda

Telemetria de qualquer tipo, swipe para dispensar, toast com ação, boundary por
tela, e captura de rejeição de promise fora do TanStack Query. O desenho está em
`docs/superpowers/specs/2026-09-02-error-layer-design.md`.
