# Config

Variáveis de ambiente do app, lidas e validadas em um único lugar. Nada mais
no código lê `process.env` diretamente.

## Constants

| Name           | Description                                                        |
| -------------- | ------------------------------------------------------------------ |
| `API_BASE_URL` | URL base da API, sem barra no final. Validada no import — um valor ausente ou malformado derruba o app no boot, com mensagem nomeando a variável. |

## Functions

| Name                       | Description                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `readApiBaseUrl(rawValue)` | Valida e normaliza a URL base. Existe separada da constante para que os modos de falha sejam testáveis sem reimportar o módulo. |

## Conventions

- A variável é `EXPO_PUBLIC_API_URL`, definida em `.env` (copie de
  `.env.example`). O prefixo `EXPO_PUBLIC_` é obrigatório: é o que faz o Expo
  expô-la ao bundle do cliente.
- `process.env.EXPO_PUBLIC_API_URL` precisa aparecer escrito por extenso. O
  Babel só reescreve a expressão completa — desestruturar `process.env` antes
  deixa o valor `undefined` em build de produção.
- Emulador Android alcança a máquina host em `10.0.2.2`, não em `localhost`.
