# Lib

Integrações com o mundo externo que não pertencem a nenhum módulo. Hoje só a
API. **Nada aqui conhece React** — sem hooks, sem contextos, sem componentes —
e nada aqui conhece módulo de domínio: quando o cliente precisa de algo que só
um módulo sabe (o token da sessão), ele expõe um ponto de registro e o módulo
se registra nele.

## Constants (objeto)

| Name  | Description |
| ----- | ------------- |
| `api` | `{ get, post, patch, delete }` — um método por verbo, cada um `(path, body?) => Promise<T>`. Único ponto de entrada do cliente. |

## Functions

| Name                           | Description                                                     |
| ------------------------------ | ---------------------------------------------------------------- |
| `configureAuthorization(h)`    | Registra `{ getAccessToken, onUnauthorized }`. Passe `null` para desregistrar. |
| `startConnectivityWatch()`     | Liga o NetInfo ao `onlineManager` do TanStack Query. Chamado uma vez pelo `App.tsx`. |

## Constants

| Name                    | Description                                                       |
| ----------------------- | ------------------------------------------------------------------ |
| `API_ERROR_CODES`       | Os códigos de erro da API, copiados do `api-clean-platform`, mais dois do próprio cliente (`NETWORK_ERROR`, `UNEXPECTED_RESPONSE`). |
| `HTTP_METHODS`          | Métodos usados pelo app.                                           |
| `CLIENT_FAILURE_STATUS` | `0` — não houve status HTTP: a falha foi deste lado do fio.        |

## Types

| Name                    | Description                                              |
| ----------------------- | --------------------------------------------------------- |
| `ApiError`              | Erro com `status`, `code`, `details` e `traceId`.          |
| `ValidationDetail`      | Um item de `details[]` numa resposta 400.                  |
| `ErrorEnvelope`         | O formato de erro que a API sempre devolve.                |
| `RequestOptions`        | `{ method?, body? }`.                                      |
| `AuthorizationHandlers` | O par de callbacks que liga o cliente à sessão.            |

## Conventions

- **É axios**, com `baseURL` e `timeout` na instância e dois interceptors: um
  põe o bearer token, o outro traduz qualquer falha para `ApiError`. Toda
  chamada de rede do app passa por `api.get/post/patch/delete`.
- **`axiosInstance` (a instância crua do axios) não é reexportada pelo
  `index.ts`.** Ela é exportada de `api.ts` só para o teste colocado trocar o
  `defaults.adapter`; de fora da pasta o único caminho é o objeto `api`, então
  não dá para escapar do token nem da tradução de erro.
- **Um método por verbo, não uma função com `{ method, body }`.** Um call site
  como `api.post('/auth/login', credentials)` diz o que faz sem repetir o
  método; a versão anterior (`request(path, { method: 'POST', body })`) fazia
  o chamador escrever o método toda vez que ele já era óbvio pela intenção da
  chamada.
- **`code` é contrato; `message` não é.** Trate por `code`; a `message` serve
  para log e debug e nunca vai crua para a tela. Um `code` desconhecido cai na
  copy genérica da tela — por isso `ApiError.code` é `string`, não uma união.
- **Um 401 só encerra a sessão quando o código é `INVALID_ACCESS_TOKEN`.** O
  401 de `/auth/login` significa senha errada, e deslogar ali seria destruir
  uma sessão que não existe.
- **Timeout e cancelamento são do axios**, não escritos à mão. Não use
  `AbortSignal.timeout()` em lugar nenhum deste repo: o React Native faz
  polyfill de `AbortSignal` com `abort-controller@3`, que não tem o método
  estático, mas o Node (e portanto o Jest) tem — o erro passaria em todos os
  testes e quebraria só no app.
- **O React Native não tem `navigator.onLine`.** Sem `startConnectivityWatch()`,
  o TanStack Query assume que o aparelho está sempre online: nunca pausa uma
  query e gasta tentativas contra um rádio desligado.
- `configureAuthorization` é o único ponto a mudar quando a API ganhar
  `POST /auth/refresh`.
