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
| `configureAuthorization(h)`    | Registra `{ getAccessToken, refreshAccessToken }`. Passe `null` para desregistrar. |
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
- **Só um `401 INVALID_ACCESS_TOKEN` dispara refresh.** O cliente chama
  `refreshAccessToken()`, espera, e **repete a request uma vez** com o token
  novo. As três respostas do handler são o contrato inteiro: um token significa
  repetir; `null` significa que a sessão acabou **e já foi encerrada pelo
  handler**, então o erro original é propagado; uma rejeição significa que o
  próprio refresh falhou (offline, 503) com a sessão intacta — e é ela que o
  chamador vê, em vez do 401. É isso que impede uma conexão perdida de ser lida
  como logout.
- **Nenhuma flag de opt-out por request é necessária**, e é a API que torna isso
  possível: `/auth/refresh` e `/auth/logout` falham com `INVALID_REFRESH_TOKEN`
  e `/auth/login` com `INVALID_CREDENTIALS`, então só `/auth/me` e
  `/auth/logout-all` produzem o código que dispara refresh — exatamente as duas
  chamadas que vale repetir. A única guarda é contra loop: `hasRetriedAfterRefresh`
  na config do axios.
- **Esta camada não sabe o que é refresh token.** Onde ele mora, o que
  `REFRESH_TOKEN_REUSED` significa e quais falhas encerram sessão são assunto de
  `src/modules/auth/`.
- **Timeout e cancelamento são do axios**, não escritos à mão. Não use
  `AbortSignal.timeout()` em lugar nenhum deste repo: o React Native faz
  polyfill de `AbortSignal` com `abort-controller@3`, que não tem o método
  estático, mas o Node (e portanto o Jest) tem — o erro passaria em todos os
  testes e quebraria só no app.
- **O React Native não tem `navigator.onLine`.** Sem `startConnectivityWatch()`,
  o TanStack Query assume que o aparelho está sempre online: nunca pausa uma
  query e gasta tentativas contra um rádio desligado.
