# Auth

Sessão do app: cadastro, login, restauração da sessão no boot, logout e o
estado que a navegação usa para escolher entre o stack logado e o deslogado.
Fala com os três endpoints de `/auth` da API (`api-clean-platform`).

## Components

| Name        | Description                                                      |
| ----------- | ------------------------------------------------------------------ |
| `AuthProvider` | Guarda o token e o usuário. Registra-se no cliente HTTP na montagem. |
| `AuthStack` | Navigator deste módulo: `SignIn` e `SignUp`.                        |

## Hooks

| Name       | Description                                                              |
| ---------- | -------------------------------------------------------------------------- |
| `useAuth()` | `{ status, user, signIn, signUp, signOut, isSubmitting }`. Lança se usado fora do `AuthProvider`. |

## Constants

| Name            | Description                                                     |
| --------------- | ----------------------------------------------------------------- |
| `AUTH_STATUSES` | `loading` \| `signedOut` \| `signedIn`.                            |
| `AUTH_ROUTES`   | Nomes das rotas deste módulo.                                      |

## Types

| Name                 | Description                                           |
| -------------------- | ------------------------------------------------------- |
| `AuthStatus`         | União derivada de `AUTH_STATUSES`.                      |
| `AuthContextValue`   | O que `useAuth()` devolve.                              |
| `User`               | Perfil de `/auth/me`. Datas são strings ISO.            |
| `Credentials`        | `{ email, password }`.                                  |
| `AuthStackParamList` | Parâmetros das rotas deste módulo.                      |

## Conventions

- **`loading` é só o boot.** Cobre ler o keychain e o primeiro `/auth/me`, e
  nunca volta. O pending de login e cadastro vive em `isSubmitting`, no botão —
  se `loading` voltasse, entrar na conta trocaria a tela por um splash no meio
  do submit.
- **`signedIn` exige token E usuário.** Token sozinho não é sessão: só
  `/auth/me` diz se ele ainda verifica.
- **O usuário sai do token, não do cache.** O logout esvazia o cache do
  TanStack Query fora do ciclo de render do React, e cache esvaziado não agenda
  render nenhum: ler `meQuery.data` direto manteria na tela o perfil de quem
  acabou de sair. O token é estado, então perdê-lo re-renderiza.
- **Cadastro faz login em seguida.** `POST /auth/register` responde
  `201 { id }` e não emite sessão; sem o login encadeado, criar a conta jogaria
  o usuário de volta na tela de login.
- **Um token que a API rejeitou é apagado; um token que falhou por rede não.**
  Estar offline no boot não é motivo para exigir a senha de novo no próximo.
- **A `message` da API nunca vai para a tela.** A copy sai de `errorCopy.ts`,
  escolhida pelo `code`; código desconhecido cai na mensagem genérica.
- `storage.web.ts` usa `localStorage`, que **não** é equivalente ao keychain —
  qualquer script da origem lê. O alvo web é conveniência de desenvolvimento,
  não superfície de produção.

## Não existe ainda

Refresh de token e logout no servidor: a API não tem os endpoints. Enquanto não
tiver, um `401 INVALID_ACCESS_TOKEN` encerra a sessão e o logout é local. O
único ponto a mudar é `configureAuthorization` em `src/services/http/` — o
desenho está em `docs/superpowers/specs/2026-09-01-auth-module-design.md`, §9.
