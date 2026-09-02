# HTTP

Cliente único de acesso à API. Toda chamada de rede do app passa por aqui, e
todo erro sai daqui como `ApiError` — inclusive falha de rede e resposta fora
do contrato, para que quem chama trate um tipo só.

## Functions

| Name                           | Description                                                     |
| ------------------------------ | ---------------------------------------------------------------- |
| `request<T>(path, options?)`   | Faz a requisição, devolve o corpo parseado, lança `ApiError` em qualquer falha. |
| `configureAuthorization(h)`    | Registra `{ getAccessToken, onUnauthorized }`. Passe `null` para desregistrar. |

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

- **`code` é contrato; `message` não é.** Trate por `code`; a `message` serve
  para log e debug e nunca vai crua para a tela. Um `code` desconhecido cai na
  copy genérica da tela — por isso `ApiError.code` é `string`, não uma união.
- **Um 401 só encerra a sessão quando o código é `INVALID_ACCESS_TOKEN`.** O
  401 de `/auth/login` significa senha errada, e deslogar ali seria destruir
  uma sessão que não existe.
- **Nunca use `AbortSignal.timeout()`.** O React Native faz polyfill de
  `AbortSignal` com `abort-controller@3`, que não tem o método estático. O Node
  (e portanto o Jest) tem — então o erro passaria em todos os testes e quebraria
  só no app. Use `AbortController` + `setTimeout`.
- `configureAuthorization` é o único ponto a mudar quando a API ganhar
  `POST /auth/refresh`.
