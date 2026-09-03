# Auth

Sessão do app: cadastro, login, rotação do refresh token, restauração da sessão
no boot, logout (neste aparelho ou em todos) e o estado que a navegação usa para
escolher entre o stack logado e o deslogado. Fala com os seis endpoints de
`/auth` da API (`api-clean-platform`).

## Components

| Name        | Description                                                      |
| ----------- | ------------------------------------------------------------------ |
| `AuthProvider` | Guarda o token e o usuário. Registra-se no cliente HTTP na montagem. |
| `AuthStack` | Navigator deste módulo: `SignIn` e `SignUp`.                        |

## Hooks

| Name       | Description                                                              |
| ---------- | -------------------------------------------------------------------------- |
| `useAuth()` | `{ status, user, signIn, signUp, signOut, signOutEverywhere, isSubmitting, isSigningOut }`. Lança se usado fora do `AuthProvider`. |

## Constants

| Name            | Description                                                     |
| --------------- | ----------------------------------------------------------------- |
| `AUTH_STATUSES` | `loading` \| `signedOut` \| `signedIn`.                            |

## Types

| Name                 | Description                                           |
| -------------------- | ------------------------------------------------------- |
| `AuthStatus`         | União derivada de `AUTH_STATUSES`.                      |
| `AuthContextValue`   | O que `useAuth()` devolve.                              |
| `User`               | Perfil de `/auth/me`. Datas são strings ISO.            |
| `Credentials`        | `{ email, password }`.                                  |
| `AuthStackParamList` | Parâmetros das rotas deste módulo (`SignIn`, `SignUp`). |

## Conventions

- **`loading` é só o boot.** Cobre ler o keychain e o primeiro `/auth/me`, e
  nunca volta. O pending de login e cadastro vive em `isSubmitting`, no botão —
  se `loading` voltasse, entrar na conta trocaria a tela por um splash no meio
  do submit.
- **`signedIn` exige token E usuário.** Token sozinho não é sessão: só
  `/auth/me` diz se ele ainda verifica.
- **O access token nunca vai para o disco.** O SecureStore guarda só o refresh
  token; o access vive em memória enquanto o processo existir. O boot restaura a
  sessão **gastando** o refresh token, não confiando num access guardado — é o
  que a decisão 11 da API prescreve, e tira do disco uma credencial válida por
  uma hora inteira.
- **Refresh é single-flight, e a API exige isso por escrito.** Dois refresh
  concorrentes com o mesmo token devolvem dois tokens e só o último emitido
  continua válido; quem guardar o outro é deslogado no refresh seguinte.
  `createSingleFlight` (em `utils/`) é o que garante uma chamada por vez, com
  quem chegar depois esperando o mesmo resultado.
- **O token rotacionado é gravado antes de o refresh resolver.** Se o processo
  morrer nesse intervalo, o disco fica com um token já gasto — que é exatamente
  o que a janela de graça de 30 segundos da API perdoa. Passado esse tempo vira
  detecção de reuso e logout, e esse é o comportamento correto, não um defeito
  a esconder.
- **`signOut` engole a falha; `signOutEverywhere` não.** O primeiro tenta o
  `POST /auth/logout` e **sempre** sai localmente: prender o usuário numa conta
  porque o aparelho está offline é pior do que um refresh token que vive até
  expirar, ainda mais quando a limpeza local apaga a única cópia dele. O segundo
  relança e **mantém** a sessão: a promessa dele é "todos os aparelhos", e
  degradar em silêncio para um logout local diria que as outras sessões
  acabaram quando não acabaram.
- **O usuário sai do token, não do cache.** O logout esvazia o cache do
  TanStack Query fora do ciclo de render do React, e cache esvaziado não agenda
  render nenhum: ler `meQuery.data` direto manteria na tela o perfil de quem
  acabou de sair. O token é estado, então perdê-lo re-renderiza.
- **Cadastro faz login em seguida.** `POST /auth/register` responde
  `201 { id }` e não emite sessão; sem o login encadeado, criar a conta jogaria
  o usuário de volta na tela de login.
- **Um token que a API rejeitou é apagado; um token que falhou por rede não.**
  Estar offline no boot não é motivo para exigir a senha de novo no próximo.
- **A `message` da API nunca vai para a tela.** A copy sai de `@/errors`,
  escolhida pelo `code`; este módulo registra só os seus dois códigos de domínio
  em `AUTH_ERROR_COPY`, e o `App.tsx` os registra na camada de erros. Uma tela
  renderizada isolada num teste não tem composition root, então registra o mesmo
  mapa no `beforeEach` — sem isso ela cai no texto genérico em silêncio.
- **O `/auth/me` do boot não é silencioso.** Se ele falhar por rede, o usuário vê
  um toast de "sem conexão" em vez de cair no login sem explicação.
- **Os schemas ficam em duas pastas por propósito diferente.**
  `validations/` valida o que o usuário digita (consumido pelo react-hook-form);
  `api/schemas.ts` valida o que a API devolve. Só o segundo é contrato de rede.
- **Nome de rota é literal**, aqui e no resto do app: `<Stack.Screen
  name="SignIn">` e `navigation.navigate('SignUp')`. Quem declara os nomes é o
  `AuthStackParamList`, e o `tsc` recusa qualquer nome fora dele.
- `storage.web.ts` usa `localStorage`, que **não** é equivalente ao keychain —
  qualquer script da origem lê. O alvo web é conveniência de desenvolvimento,
  não superfície de produção.
- **A lógica de "o que este boot/token/erro significa" mora em `utils/`**, não
  dentro do `AuthProvider`: `resolveStatus` (deriva `AuthStatus` de
  `hasCompletedBoot`/`token`/`user`), `isEndedSession` (os três códigos que
  significam sessão encerrada) e `createSingleFlight`. Nenhuma é exportada pelo
  módulo — são detalhe de implementação, testadas direto em vez de só
  indiretamente via `AuthContext.test.tsx`.
- **`isEndedSession` delega para o `classifyError` de `@/errors`** em vez de
  repetir o conjunto de códigos. Duas listas dos mesmos três códigos divergem no
  dia em que um quarto aparecer.
