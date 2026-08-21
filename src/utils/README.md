# Utils

Helpers puros, sem React e sem I/O. Se um helper precisa de estado, de um hook
ou de rede, ele pertence a `src/hooks/` ou `src/services/` em vez daqui.

## Functions

| Name             | Description                                                           |
| ---------------- | --------------------------------------------------------------------- |
| `cn(...inputs)`  | Combina nomes de classe condicionalmente e resolve conflitos do Tailwind (`cn('p-2','p-4')` → `'p-4'`). |

## Conventions

- Todo export é puro e testável de forma independente.
- Um helper por arquivo, nomeado como o helper; `index.ts` é a superfície pública.
