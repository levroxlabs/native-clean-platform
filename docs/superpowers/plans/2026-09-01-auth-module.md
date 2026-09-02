# Auth Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `src/modules/auth/` — sign up, sign in, session restore on cold start, sign out, and a navigation gate — against the three auth endpoints that exist in `api-clean-platform` today.

**Architecture:** Two shared modules are created first because auth forces them into existence: `src/config/` (one validated environment variable) and `src/services/http/` (a fetch wrapper that knows nothing about React or about auth, and reaches the session through one registered pair of callbacks). The auth module then owns its API layer, its token storage, its session provider, its navigator, and two plain screens. `src/navigation/` stops listing screens and starts listing modules.

**Tech Stack:** Expo SDK 57 · React Native 0.86 · TypeScript 6 · TanStack Query 5 · react-hook-form 7 + zod 4 · expo-secure-store · NativeWind v4 · React Navigation 7 · Jest (jest-expo) + React Native Testing Library · Biome · pnpm

**Spec:** [`docs/superpowers/specs/2026-09-01-auth-module-design.md`](../specs/2026-09-01-auth-module-design.md)

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec and from `AGENTS.md`.

- **English only** in code — comments, JSDoc, identifiers, file names, commit messages. `README.md` prose is **Portuguese**; identifiers and folder names inside them stay English.
- **Arrow functions assigned to a `const`.** Never a `function` declaration or expression. (`class ApiError extends Error` is the one exception in this plan — `instanceof` is the point of it.)
- **No magic strings or numbers.** `UPPER_SNAKE_CASE` primitives carrying their unit (`REQUEST_TIMEOUT_MS`); closed sets as a `const` object + derived union type, never a TS `enum`. User-facing copy lives in a `COPY` object colocated with its screen.
- **Design values come from Tailwind/NativeWind classes only** — no `StyleSheet.create`, no inline style objects. Prefer semantic aliases (`bg-background`, `text-content-muted`, `bg-primary`) over raw scales.
- **`@/` alias** points at `src/`; never write `../../`. Nothing outside a module imports a file inside it — only what its `index.ts` exports.
- **Tests are colocated** with a `.test.ts` / `.test.tsx` suffix. The suffix is required, not cosmetic: it is what `biome.json` matches to exempt tests from `noMagicNumbers`. `render()` and `fireEvent.*()` return Promises in the installed RNTL and **must be awaited**.
- **The `@/` alias resolves under Jest** with no `moduleNameMapper` — verified by running a probe test in this repo, not assumed. Import through `@/` in tests exactly as in source.
- **`noUncheckedIndexedAccess` is on** — indexing a record yields `T | undefined`.
- **Biome formatting:** single quotes, double quotes in JSX, semicolons, trailing commas, 2-space indent, 100-column lines.
- **`AbortSignal.timeout()` does not exist in React Native.** RN polyfills `AbortSignal` with `abort-controller@3.0.0`, which has no static `timeout()`. It *does* exist under Jest's Node environment — so using it passes every test and crashes the app. Use `AbortController` + `setTimeout`.
- **API error codes are contract; API error `message` is not.** Branch on `code`; never render `message` raw.
- **Every task ends green** on `pnpm check` (typecheck + lint) and `pnpm test:ci`, and ends with a commit.

---

### Task 1: Environment configuration

Creates the one variable the HTTP client needs, and the Jest setup file every later task depends on.

**Files:**
- Modify: `package.json` (dependencies + the `jest` block)
- Create: `.env.example`
- Modify: `.gitignore`
- Create: `jest.setup.ts`
- Create: `src/config/env.ts`
- Test: `src/config/env.test.ts`
- Create: `src/config/index.ts`
- Create: `src/config/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `readApiBaseUrl(rawValue: string | undefined): string` and `API_BASE_URL: string`, both exported from `@/config`.

- [ ] **Step 1: Install the dependencies**

```bash
pnpm add @tanstack/react-query react-hook-form zod @hookform/resolvers
npx expo install expo-secure-store
```

`npx expo install` (not `pnpm add`) for `expo-secure-store`: it resolves the version matching SDK 57 instead of the newest published one.

- [ ] **Step 2: Write the failing test**

Create `src/config/env.test.ts`:

```ts
import { readApiBaseUrl } from './env';

describe('readApiBaseUrl', () => {
  it('returns the URL when it is set', () => {
    expect(readApiBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('accepts the address an Android emulator uses for the host machine', () => {
    expect(readApiBaseUrl('http://10.0.2.2:3000')).toBe('http://10.0.2.2:3000');
  });

  it('drops a trailing slash so paths never double up', () => {
    expect(readApiBaseUrl('http://localhost:3000/')).toBe('http://localhost:3000');
  });

  it('names the variable when it is missing', () => {
    expect(() => readApiBaseUrl(undefined)).toThrow('EXPO_PUBLIC_API_URL');
  });

  it('names the variable when it is blank', () => {
    expect(() => readApiBaseUrl('   ')).toThrow('EXPO_PUBLIC_API_URL');
  });

  it('rejects a value that is not an http URL', () => {
    expect(() => readApiBaseUrl('localhost:3000')).toThrow('EXPO_PUBLIC_API_URL');
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `pnpm exec jest src/config/env.test.ts`
Expected: FAIL — `Cannot find module './env'`.

- [ ] **Step 4: Implement `src/config/env.ts`**

```ts
const API_BASE_URL_VARIABLE = 'EXPO_PUBLIC_API_URL';

/**
 * Deliberately a regex and not `new URL()` or a zod schema. React Native's
 * `URL` is a partial polyfill, and `new URL('localhost:3000')` succeeds in a
 * full implementation anyway — it reads `localhost:` as the protocol. What
 * this guard has to catch is exactly that mistake.
 */
const HTTP_URL_PATTERN = /^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/;
const TRAILING_SLASH_PATTERN = /\/+$/;

const INVALID_API_BASE_URL_MESSAGE =
  `${API_BASE_URL_VARIABLE} must be the base URL of the API, such as ` +
  'http://localhost:3000. Copy .env.example to .env and set it. An Android ' +
  'emulator reaches the host machine at 10.0.2.2, not localhost.';

/**
 * Split from the constant below so both failure modes are testable without
 * re-importing the module.
 */
export const readApiBaseUrl = (rawValue: string | undefined): string => {
  const value = rawValue?.trim() ?? '';

  if (!HTTP_URL_PATTERN.test(value)) {
    throw new Error(INVALID_API_BASE_URL_MESSAGE);
  }

  return value.replace(TRAILING_SLASH_PATTERN, '');
};

/**
 * Read once, at import time, on purpose: a misconfigured app must die at boot
 * with the message above rather than at its first request with an opaque fetch
 * failure.
 *
 * `process.env.EXPO_PUBLIC_API_URL` must stay written out in full. Babel only
 * rewrites the complete member expression — destructuring `process.env` first
 * leaves the value `undefined` in a release build.
 */
export const API_BASE_URL = readApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);
```

- [ ] **Step 5: Create the Jest setup file**

Create `jest.setup.ts`:

```ts
/**
 * `babel-preset-expo` only inlines EXPO_PUBLIC_* variables in production
 * builds. In development and under Jest it rewrites them to `expo/virtual/env`,
 * which is `export const env = process.env` — so assigning here is read live by
 * `src/config/env.ts` when it loads.
 */
const TEST_API_BASE_URL = 'http://localhost:3000';

process.env.EXPO_PUBLIC_API_URL = TEST_API_BASE_URL;
```

Register it in the `jest` block of `package.json`:

```json
"jest": {
  "preset": "jest-expo",
  "setupFiles": [
    "react-native-gesture-handler/jestSetup",
    "<rootDir>/jest.setup.ts"
  ]
}
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `pnpm exec jest src/config/env.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Create `.env.example` and ignore `.env`**

`.env.example`:

```
# Base URL of the api-clean-platform instance this app talks to.
# The API defaults to port 3000.
#
# iOS simulator / web:  http://localhost:3000
# Android emulator:     http://10.0.2.2:3000   (localhost is the emulator itself)
# Physical device:      http://<your-machine-lan-ip>:3000
EXPO_PUBLIC_API_URL=http://localhost:3000
```

Append to `.gitignore`, under the existing `# local env files` heading, so the real values never get committed while the example does:

```
.env
```

- [ ] **Step 8: Write the public surface and the README**

`src/config/index.ts`:

```ts
export { API_BASE_URL, readApiBaseUrl } from './env';
```

`src/config/README.md` (Portuguese prose, per Rule 3):

```md
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
```

- [ ] **Step 9: Verify and commit**

```bash
pnpm check && pnpm test:ci
git add package.json pnpm-lock.yaml .env.example .gitignore jest.setup.ts src/config
git commit -m "feat: read and validate the API base URL at boot"
```

---

### Task 2: HTTP client

**Files:**
- Create: `src/services/README.md`
- Create: `src/services/http/errorCodes.ts`
- Create: `src/services/http/types.ts`
- Create: `src/services/http/ApiError.ts`
- Create: `src/services/http/client.ts`
- Test: `src/services/http/client.test.ts`
- Create: `src/services/http/index.ts`
- Create: `src/services/http/README.md`

**Interfaces:**
- Consumes: `API_BASE_URL` from `@/config`.
- Produces, all exported from `@/services/http`:
  - `request<TResponse>(path: string, options?: RequestOptions): Promise<TResponse>`
  - `configureAuthorization(handlers: AuthorizationHandlers | null): void`
  - `class ApiError extends Error` with `status: number`, `code: string`, `details: ValidationDetail[]`, `traceId: string`
  - `API_ERROR_CODES`, `HTTP_METHODS`, `CLIENT_FAILURE_STATUS`
  - types `RequestOptions`, `AuthorizationHandlers`, `ValidationDetail`, `ErrorEnvelope`

- [ ] **Step 1: Write the error codes and types**

`src/services/http/errorCodes.ts`:

```ts
/**
 * The API's stable error codes, copied from `api-clean-platform`. `code` is
 * contract on both sides; `message` is not, and is never rendered raw.
 *
 * The client's own two codes are marked. A code arriving from the API that is
 * absent here is not an error — `ApiError.code` is a plain string precisely so
 * a new server code degrades to the fallback copy instead of crashing.
 */
export const API_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  INVALID_ACCESS_TOKEN: 'INVALID_ACCESS_TOKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_IN_USE: 'EMAIL_ALREADY_IN_USE',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_EMAIL: 'INVALID_EMAIL',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  /** Client-side: the request never reached the API. */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** Client-side: the API answered something that is not the agreed shape. */
  UNEXPECTED_RESPONSE: 'UNEXPECTED_RESPONSE',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
```

`src/services/http/types.ts`:

```ts
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
} as const;

export type HttpMethod = (typeof HTTP_METHODS)[keyof typeof HTTP_METHODS];

/** One entry of the API's `details` array on a 400. */
export interface ValidationDetail {
  field?: string;
  code: string;
}

/** The single shape every API error arrives in. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: ValidationDetail[];
    traceId: string;
  };
}

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
}

/**
 * The client's only tie to the session, registered by `AuthProvider`. This is
 * the seam token refresh plugs into — see the spec, §9.
 */
export interface AuthorizationHandlers {
  getAccessToken: () => string | null;
  onUnauthorized: () => void;
}
```

- [ ] **Step 2: Write `ApiError`**

`src/services/http/ApiError.ts`:

```ts
import type { ValidationDetail } from './types';

const API_ERROR_NAME = 'ApiError';
const NO_TRACE_ID = '';

interface ApiErrorInput {
  status: number;
  code: string;
  message: string;
  details?: ValidationDetail[];
  traceId?: string;
}

/**
 * Every failure this client throws — HTTP or not — so callers handle one type
 * and branch on `code`.
 *
 * A class rather than a factory: `instanceof` is what a caller needs, and it is
 * the one thing a plain object cannot give.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ValidationDetail[];
  readonly traceId: string;

  constructor({ status, code, message, details = [], traceId = NO_TRACE_ID }: ApiErrorInput) {
    super(message);
    this.name = API_ERROR_NAME;
    this.status = status;
    this.code = code;
    this.details = details;
    this.traceId = traceId;
  }
}
```

- [ ] **Step 3: Write the failing test**

`src/services/http/client.test.ts`:

```ts
import { ApiError } from './ApiError';
import { configureAuthorization, request } from './client';
import { API_ERROR_CODES } from './errorCodes';
import { HTTP_METHODS } from './types';

const BASE_URL = 'http://localhost:3000';
const PATH = '/auth/me';
const TOKEN = 'a-token';

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const envelope = (code: string, extra: Record<string, unknown> = {}) => ({
  error: { code, message: 'human readable', traceId: 'trace-1', ...extra },
});

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  configureAuthorization(null);
});

describe('request', () => {
  it('prefixes the base URL and returns the parsed body', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { id: 'user-1' }));

    await expect(request(PATH)).resolves.toEqual({ id: 'user-1' });
    expect(mockFetch).toHaveBeenCalledWith(`${BASE_URL}${PATH}`, expect.anything());
  });

  it('serializes the body and sets the JSON content type on a POST', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, {}));

    await request(PATH, { method: HTTP_METHODS.POST, body: { email: 'a@b.co' } });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.co' }));
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('attaches the bearer token when a provider returns one', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, {}));
    configureAuthorization({ getAccessToken: () => TOKEN, onUnauthorized: jest.fn() });

    await request(PATH);

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('omits the header when there is no token', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, {}));
    configureAuthorization({ getAccessToken: () => null, onUnauthorized: jest.fn() });

    await request(PATH);

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('turns the error envelope into an ApiError carrying code, details and traceId', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(
        400,
        envelope(API_ERROR_CODES.VALIDATION_ERROR, {
          details: [{ field: 'email', code: 'invalid_format' }],
        }),
      ),
    );

    await expect(request(PATH)).rejects.toMatchObject({
      status: 400,
      code: API_ERROR_CODES.VALIDATION_ERROR,
      details: [{ field: 'email', code: 'invalid_format' }],
      traceId: 'trace-1',
    });
  });

  it('still throws an ApiError when the error body is not the envelope', async () => {
    mockFetch.mockResolvedValue(jsonResponse(502, '<html>bad gateway</html>'));

    await expect(request(PATH)).rejects.toMatchObject({
      status: 502,
      code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
    });
  });

  it('ends the session on a 401 caused by the access token', async () => {
    const onUnauthorized = jest.fn();
    mockFetch.mockResolvedValue(jsonResponse(401, envelope(API_ERROR_CODES.INVALID_ACCESS_TOKEN)));
    configureAuthorization({ getAccessToken: () => TOKEN, onUnauthorized });

    await expect(request(PATH)).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does NOT end the session on the 401 a wrong password produces', async () => {
    const onUnauthorized = jest.fn();
    mockFetch.mockResolvedValue(jsonResponse(401, envelope(API_ERROR_CODES.INVALID_CREDENTIALS)));
    configureAuthorization({ getAccessToken: () => null, onUnauthorized });

    await expect(request(PATH)).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('turns a failed fetch into a NETWORK_ERROR ApiError', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    await expect(request(PATH)).rejects.toMatchObject({
      code: API_ERROR_CODES.NETWORK_ERROR,
    });
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `pnpm exec jest src/services/http/client.test.ts`
Expected: FAIL — `Cannot find module './client'`.

- [ ] **Step 5: Implement `src/services/http/client.ts`**

```ts
import { API_BASE_URL } from '@/config';

import { ApiError } from './ApiError';
import { API_ERROR_CODES } from './errorCodes';
import {
  type AuthorizationHandlers,
  type ErrorEnvelope,
  HTTP_METHODS,
  type RequestOptions,
} from './types';

const REQUEST_TIMEOUT_MS = 15000;

const UNAUTHORIZED_STATUS = 401;
const NO_CONTENT_STATUS = 204;
/** No HTTP status exists: the request failed on this side of the wire. */
export const CLIENT_FAILURE_STATUS = 0;

const AUTHORIZATION_HEADER = 'Authorization';
const CONTENT_TYPE_HEADER = 'Content-Type';
const BEARER_PREFIX = 'Bearer ';
const JSON_CONTENT_TYPE = 'application/json';

const NETWORK_ERROR_MESSAGE = 'The request did not reach the API.';
const UNEXPECTED_RESPONSE_MESSAGE = 'The API answered with an unexpected body.';

let handlers: AuthorizationHandlers | null = null;

/**
 * The only tie between this module and the session. `AuthProvider` registers
 * itself on mount and clears the registration on unmount.
 *
 * This is where token refresh goes when the API grows `POST /auth/refresh`:
 * `onUnauthorized` attempts the refresh and retries, instead of ending the
 * session. Nothing else in the app changes — spec §9.
 */
export const configureAuthorization = (next: AuthorizationHandlers | null): void => {
  handlers = next;
};

const buildHeaders = (hasBody: boolean): Record<string, string> => {
  const headers: Record<string, string> = {};
  const token = handlers?.getAccessToken() ?? null;

  if (hasBody) headers[CONTENT_TYPE_HEADER] = JSON_CONTENT_TYPE;
  if (token !== null) headers[AUTHORIZATION_HEADER] = `${BEARER_PREFIX}${token}`;

  return headers;
};

const isErrorEnvelope = (body: unknown): body is ErrorEnvelope => {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;

  const { error } = body as { error: unknown };

  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string'
  );
};

const readJson = async (response: Response): Promise<unknown> => {
  if (response.status === NO_CONTENT_STATUS) return null;

  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const request = async <TResponse>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> => {
  const { method = HTTP_METHODS.GET, body } = options;
  const controller = new AbortController();
  // NOT `AbortSignal.timeout()`: React Native polyfills AbortSignal with
  // abort-controller@3, which has no static timeout(). Node — and therefore
  // Jest — does have it, so the mistake would pass every test and crash the app.
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: buildHeaders(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // Swallowed on purpose: a DNS failure, an offline radio and a timeout are
    // one state to a caller, and the library's message is not contract.
    throw new ApiError({
      status: CLIENT_FAILURE_STATUS,
      code: API_ERROR_CODES.NETWORK_ERROR,
      message: NETWORK_ERROR_MESSAGE,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await readJson(response);

  if (response.ok) return payload as TResponse;

  if (!isErrorEnvelope(payload)) {
    throw new ApiError({
      status: response.status,
      code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
      message: UNEXPECTED_RESPONSE_MESSAGE,
    });
  }

  // Only a token failure ends the session. A 401 from `/auth/login` means the
  // password was wrong — signing the user out there would be answering a failed
  // guess by destroying a session that does not exist.
  if (
    response.status === UNAUTHORIZED_STATUS &&
    payload.error.code === API_ERROR_CODES.INVALID_ACCESS_TOKEN
  ) {
    handlers?.onUnauthorized();
  }

  throw new ApiError({
    status: response.status,
    code: payload.error.code,
    message: payload.error.message,
    details: payload.error.details ?? [],
    traceId: payload.error.traceId,
  });
};
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `pnpm exec jest src/services/http/client.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Write the public surface and the READMEs**

`src/services/http/index.ts`:

```ts
export { ApiError } from './ApiError';
export { CLIENT_FAILURE_STATUS, configureAuthorization, request } from './client';
export { API_ERROR_CODES, type ApiErrorCode } from './errorCodes';
export {
  type AuthorizationHandlers,
  type ErrorEnvelope,
  HTTP_METHODS,
  type HttpMethod,
  type RequestOptions,
  type ValidationDetail,
} from './types';
```

`src/services/README.md`:

```md
# Services

Código que fala com o mundo externo — rede, hoje; armazenamento ou telemetria,
se um dia existirem. **Nada aqui conhece React**: sem hooks, sem contextos, sem
componentes. Um serviço que precisa de estado de React é consumido por um hook,
nunca o contrário.

Nada aqui conhece módulos de domínio também. Quando um serviço precisa de algo
que só um módulo sabe — o token da sessão, por exemplo — ele expõe um ponto de
registro e o módulo se registra nele.

## Services

| Name   | Description                                              |
| ------ | -------------------------------------------------------- |
| `http` | Cliente da API: URL base, JSON, bearer token e a tradução do envelope de erro. |
```

`src/services/http/README.md`:

```md
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
```

- [ ] **Step 8: Verify and commit**

```bash
pnpm check && pnpm test:ci
git add src/services
git commit -m "feat: add the API client and its single error type"
```

---

### Task 3: Token storage

**Files:**
- Create: `src/modules/auth/constants.ts`
- Create: `src/modules/auth/storage.ts`
- Create: `src/modules/auth/storage.web.ts`
- Test: `src/modules/auth/storage.test.ts`
- Modify: `jest.setup.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (module-internal, not exported from `index.ts`): `readAccessToken(): Promise<string | null>`, `writeAccessToken(token: string): Promise<void>`, `clearAccessToken(): Promise<void>`, and `ACCESS_TOKEN_STORAGE_KEY` in `constants.ts`.

- [ ] **Step 1: Add the in-memory secure-store mock to `jest.setup.ts`**

Append to `jest.setup.ts`:

```ts
/**
 * An in-memory keychain. Real `expo-secure-store` needs a native module, and
 * an explicit mock also lets a test assert what was actually stored.
 */
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();

  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});
```

- [ ] **Step 2: Write the failing test**

`src/modules/auth/storage.test.ts`:

```ts
import { clearAccessToken, readAccessToken, writeAccessToken } from './storage';

const TOKEN = 'stored-token';

beforeEach(async () => {
  await clearAccessToken();
});

describe('access token storage', () => {
  it('reads null when nothing was stored', async () => {
    await expect(readAccessToken()).resolves.toBeNull();
  });

  it('reads back what it wrote', async () => {
    await writeAccessToken(TOKEN);

    await expect(readAccessToken()).resolves.toBe(TOKEN);
  });

  it('reads null after clearing', async () => {
    await writeAccessToken(TOKEN);
    await clearAccessToken();

    await expect(readAccessToken()).resolves.toBeNull();
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `pnpm exec jest src/modules/auth/storage.test.ts`
Expected: FAIL — `Cannot find module './storage'`.

- [ ] **Step 4: Write the constant and both implementations**

`src/modules/auth/constants.ts`:

```ts
/** Namespaced so a second module storing a token cannot collide with this one. */
export const ACCESS_TOKEN_STORAGE_KEY = 'auth.accessToken';
```

`src/modules/auth/storage.ts`:

```ts
import * as SecureStore from 'expo-secure-store';

import { ACCESS_TOKEN_STORAGE_KEY } from './constants';

/**
 * The native implementation: the iOS keychain and the Android keystore. The web
 * build resolves `storage.web.ts` instead — Metro picks the platform suffix.
 */
export const readAccessToken = async (): Promise<string | null> =>
  SecureStore.getItemAsync(ACCESS_TOKEN_STORAGE_KEY);

export const writeAccessToken = async (token: string): Promise<void> =>
  SecureStore.setItemAsync(ACCESS_TOKEN_STORAGE_KEY, token);

export const clearAccessToken = async (): Promise<void> =>
  SecureStore.deleteItemAsync(ACCESS_TOKEN_STORAGE_KEY);
```

`src/modules/auth/storage.web.ts`:

```ts
import { ACCESS_TOKEN_STORAGE_KEY } from './constants';

/**
 * `expo-secure-store` has no web implementation, and this repo supports
 * `pnpm web`. `localStorage` is NOT equivalent: it is readable by any script on
 * the origin. The web target here is a development convenience, not a supported
 * production surface — see this module's README.
 */
export const readAccessToken = async (): Promise<string | null> =>
  globalThis.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);

export const writeAccessToken = async (token: string): Promise<void> => {
  globalThis.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
};

export const clearAccessToken = async (): Promise<void> => {
  globalThis.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
};
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `pnpm exec jest src/modules/auth/storage.test.ts`
Expected: PASS, 3 tests.

Note for the record: the `jest-expo` preset configured in this repo runs a single platform, so `storage.web.ts` is **not** exercised by the suite. It is covered by the type checker and by running `pnpm web`, nothing more. Do not claim otherwise.

- [ ] **Step 6: Verify and commit**

```bash
pnpm check && pnpm test:ci
git add jest.setup.ts src/modules/auth
git commit -m "feat: persist the access token in the platform keychain"
```

---

### Task 4: Auth API layer

**Files:**
- Create: `src/modules/auth/api/endpoints.ts`
- Create: `src/modules/auth/api/schemas.ts`
- Test: `src/modules/auth/api/schemas.test.ts`
- Create: `src/modules/auth/api/authApi.ts`
- Test: `src/modules/auth/api/authApi.test.ts`

**Interfaces:**
- Consumes: `request`, `ApiError`, `API_ERROR_CODES`, `HTTP_METHODS`, `CLIENT_FAILURE_STATUS` from `@/services/http`.
- Produces (module-internal): `register(credentials: Credentials): Promise<string>` (the new user's id), `login(credentials: Credentials): Promise<string>` (the access token), `fetchMe(): Promise<User>`; schemas `signInSchema`, `signUpSchema`, `userSchema`; types `Credentials`, `User`; constants `MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH`, `MAX_EMAIL_LENGTH`, `PASSWORD_POLICY_PATTERN`.

- [ ] **Step 1: Write the endpoints**

`src/modules/auth/api/endpoints.ts`:

```ts
/** Matches AUTH_PREFIX in the API's `src/main/app.ts`. */
const AUTH_PREFIX = '/auth';

export const AUTH_ENDPOINTS = {
  REGISTER: `${AUTH_PREFIX}/register`,
  LOGIN: `${AUTH_PREFIX}/login`,
  ME: `${AUTH_PREFIX}/me`,
} as const;
```

- [ ] **Step 2: Write the failing schema test**

`src/modules/auth/api/schemas.test.ts`:

```ts
import { signInSchema, signUpSchema, userSchema } from './schemas';

const VALID_EMAIL = 'user@example.com';
const VALID_PASSWORD = 'sup3rS3cret!';

const signUpWith = (password: string) =>
  signUpSchema.safeParse({ email: VALID_EMAIL, password }).success;

describe('signUpSchema', () => {
  it('accepts the API own documented example', () => {
    expect(signUpWith(VALID_PASSWORD)).toBe(true);
  });

  it('rejects a password one character below the minimum', () => {
    expect(signUpWith('aB3456!')).toBe(false);
  });

  it('accepts a password exactly at the minimum', () => {
    expect(signUpWith('aB34567!')).toBe(true);
  });

  it('accepts a password exactly at the maximum', () => {
    expect(signUpWith(`aB3!${'x'.repeat(124)}`)).toBe(true);
  });

  it('rejects a password one character above the maximum', () => {
    expect(signUpWith(`aB3!${'x'.repeat(125)}`)).toBe(false);
  });

  it('rejects a password with no digit', () => {
    expect(signUpWith('abcdefgH!')).toBe(false);
  });

  it('rejects a password with no letter', () => {
    expect(signUpWith('12345678!')).toBe(false);
  });

  it('rejects a password with no symbol', () => {
    expect(signUpWith('abcdefG123')).toBe(false);
  });

  it('rejects a malformed email', () => {
    expect(signUpSchema.safeParse({ email: 'not-an-email', password: VALID_PASSWORD }).success).toBe(
      false,
    );
  });

  it('trims the email before validating it', () => {
    const parsed = signUpSchema.safeParse({ email: `  ${VALID_EMAIL}  `, password: VALID_PASSWORD });

    expect(parsed.success && parsed.data.email).toBe(VALID_EMAIL);
  });
});

describe('signInSchema', () => {
  it('accepts a password that would fail the sign-up policy', () => {
    // An account created under a looser policy must stay able to log in, and
    // enforcing the policy here would answer "your password is malformed" where
    // the honest answer is "that is not your password".
    expect(signInSchema.safeParse({ email: VALID_EMAIL, password: 'x' }).success).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(signInSchema.safeParse({ email: VALID_EMAIL, password: '' }).success).toBe(false);
  });
});

describe('userSchema', () => {
  it('parses the profile the API returns', () => {
    const parsed = userSchema.safeParse({
      id: '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21',
      email: VALID_EMAIL,
      emailVerifiedAt: null,
      createdAt: '2026-09-01T12:00:00.000Z',
    });

    expect(parsed.success).toBe(true);
  });

  it('reports human copy rather than zod internals', () => {
    // If this fails on the message and not on the parse, the installed zod
    // wants `{ error: '...' }` instead of the string shorthand — change the
    // four call sites in `schemas.ts`, not this expectation.
    const parsed = signUpSchema.safeParse({ email: 'nope', password: VALID_PASSWORD });

    expect(parsed.success).toBe(false);
    expect(parsed.success ? null : parsed.error.issues[0]?.message).toBe(
      'Enter a valid email address.',
    );
  });

  it('rejects a profile missing a field the app renders', () => {
    expect(
      userSchema.safeParse({ id: '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21', email: VALID_EMAIL })
        .success,
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `pnpm exec jest src/modules/auth/api/schemas.test.ts`
Expected: FAIL — `Cannot find module './schemas'`.

- [ ] **Step 4: Implement `src/modules/auth/api/schemas.ts`**

```ts
import { z } from 'zod';

/** All four mirror the API's value objects — keep them in step. */
export const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_POLICY_PATTERN = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/s;

/** Presence only, as on the server: see `signInSchema` below. */
const MIN_SUBMITTED_PASSWORD_LENGTH = 1;

/**
 * Rendered straight to the user by react-hook-form, so these are copy, not
 * diagnostics: zod's defaults read like "Too small: expected string to have
 * >=8 characters". They live beside the rules they describe, and together with
 * `errorCopy.ts` they are the whole i18n seam of this module.
 */
const VALIDATION_COPY = {
  email: 'Enter a valid email address.',
  passwordLength: `Use between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
  passwordPolicy: 'Include a letter, a digit and a symbol.',
  passwordRequired: 'Enter your password.',
} as const;

const emailSchema = z
  .string()
  .trim()
  .max(MAX_EMAIL_LENGTH, VALIDATION_COPY.email)
  .pipe(z.email(VALIDATION_COPY.email));

/** Registration enforces the policy the API publishes. */
export const signUpSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, VALIDATION_COPY.passwordLength)
    .max(MAX_PASSWORD_LENGTH, VALIDATION_COPY.passwordLength)
    .regex(PASSWORD_POLICY_PATTERN, VALIDATION_COPY.passwordPolicy),
});

/**
 * Sign-in checks presence, not policy — the same choice the API makes and for
 * the same reason: an account created under a looser policy must stay able to
 * log in, and rejecting locally would tell the user their password is malformed
 * when the truth is that it is wrong. The maximum stays only to bound the body.
 */
export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(MIN_SUBMITTED_PASSWORD_LENGTH, VALIDATION_COPY.passwordRequired)
    .max(MAX_PASSWORD_LENGTH, VALIDATION_COPY.passwordLength),
});

export const registerResponseSchema = z.object({ id: z.uuid() });

export const loginResponseSchema = z.object({ accessToken: z.string().min(MIN_PASSWORD_LENGTH) });

/**
 * Dates stay ISO strings — nothing formats or compares one yet, so converting
 * would add a `Date` whose only consumer is the conversion itself.
 * `emailVerifiedAt` is always null until the API's verification slice; it is
 * carried because the API publishes it.
 */
export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  emailVerifiedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type Credentials = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type User = z.infer<typeof userSchema>;
```

- [ ] **Step 5: Run the schema test and confirm it passes**

Run: `pnpm exec jest src/modules/auth/api/schemas.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 6: Write the failing API test**

`src/modules/auth/api/authApi.test.ts`:

```ts
import { API_ERROR_CODES, HTTP_METHODS, request } from '@/services/http';

import { fetchMe, login, register } from './authApi';
import { AUTH_ENDPOINTS } from './endpoints';

jest.mock('@/services/http', () => ({
  ...jest.requireActual('@/services/http'),
  request: jest.fn(),
}));

const mockRequest = request as jest.MockedFunction<typeof request>;

const CREDENTIALS = { email: 'user@example.com', password: 'sup3rS3cret!' };
const USER_ID = '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21';
const PROFILE = {
  id: USER_ID,
  email: CREDENTIALS.email,
  emailVerifiedAt: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};

beforeEach(() => {
  mockRequest.mockReset();
});

describe('register', () => {
  it('posts the credentials and returns the new user id', async () => {
    mockRequest.mockResolvedValue({ id: USER_ID });

    await expect(register(CREDENTIALS)).resolves.toBe(USER_ID);
    expect(mockRequest).toHaveBeenCalledWith(AUTH_ENDPOINTS.REGISTER, {
      method: HTTP_METHODS.POST,
      body: CREDENTIALS,
    });
  });
});

describe('login', () => {
  it('posts the credentials and returns the access token', async () => {
    mockRequest.mockResolvedValue({ accessToken: 'a-signed-token' });

    await expect(login(CREDENTIALS)).resolves.toBe('a-signed-token');
    expect(mockRequest).toHaveBeenCalledWith(AUTH_ENDPOINTS.LOGIN, {
      method: HTTP_METHODS.POST,
      body: CREDENTIALS,
    });
  });
});

describe('fetchMe', () => {
  it('gets the profile and parses it', async () => {
    mockRequest.mockResolvedValue(PROFILE);

    await expect(fetchMe()).resolves.toEqual(PROFILE);
    expect(mockRequest).toHaveBeenCalledWith(AUTH_ENDPOINTS.ME);
  });

  it('throws an ApiError when the API drifts from the agreed shape', async () => {
    mockRequest.mockResolvedValue({ ...PROFILE, id: 'not-a-uuid' });

    await expect(fetchMe()).rejects.toMatchObject({
      code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
    });
  });
});
```

- [ ] **Step 7: Run it and confirm it fails**

Run: `pnpm exec jest src/modules/auth/api/authApi.test.ts`
Expected: FAIL — `Cannot find module './authApi'`.

- [ ] **Step 8: Implement `src/modules/auth/api/authApi.ts`**

```ts
import type { z } from 'zod';

import {
  API_ERROR_CODES,
  ApiError,
  CLIENT_FAILURE_STATUS,
  HTTP_METHODS,
  request,
} from '@/services/http';

import { AUTH_ENDPOINTS } from './endpoints';
import {
  type Credentials,
  loginResponseSchema,
  registerResponseSchema,
  type User,
  userSchema,
} from './schemas';

const CONTRACT_DRIFT_MESSAGE = 'The API response did not match the expected shape:';

/**
 * Parsing responses — not just requests — is what turns a silent contract drift
 * between the two repositories into a loud, located failure. It is re-thrown as
 * an `ApiError` so callers still handle exactly one error type.
 */
const parseOrThrow = <TSchema extends z.ZodType>(
  schema: TSchema,
  payload: unknown,
): z.infer<TSchema> => {
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw new ApiError({
      status: CLIENT_FAILURE_STATUS,
      code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
      message: `${CONTRACT_DRIFT_MESSAGE} ${parsed.error.message}`,
    });
  }

  return parsed.data;
};

/** Issues no session — the caller must log in afterwards. Returns the new id. */
export const register = async (credentials: Credentials): Promise<string> => {
  const payload = await request(AUTH_ENDPOINTS.REGISTER, {
    method: HTTP_METHODS.POST,
    body: credentials,
  });

  return parseOrThrow(registerResponseSchema, payload).id;
};

export const login = async (credentials: Credentials): Promise<string> => {
  const payload = await request(AUTH_ENDPOINTS.LOGIN, {
    method: HTTP_METHODS.POST,
    body: credentials,
  });

  return parseOrThrow(loginResponseSchema, payload).accessToken;
};

/** The only way the API offers to tell whether a stored token still verifies. */
export const fetchMe = async (): Promise<User> => {
  const payload = await request(AUTH_ENDPOINTS.ME);

  return parseOrThrow(userSchema, payload);
};
```

- [ ] **Step 9: Run both test files and confirm they pass**

Run: `pnpm exec jest src/modules/auth/api`
Expected: PASS, 19 tests across two files.

- [ ] **Step 10: Verify and commit**

```bash
pnpm check && pnpm test:ci
git add src/modules/auth/api
git commit -m "feat: call the three auth endpoints and parse what they answer"
```

---

### Task 5: Session provider

**Note on ordering:** the spec lists navigation as slice 6 and screens as slice 7. This plan swaps them — `AuthStack` cannot be written before the screens it registers exist, and no task in this plan is allowed to reference a component that does not exist yet. Screens are Task 6, navigation is Task 7.

**Files:**
- Create: `src/modules/auth/types.ts`
- Create: `src/modules/auth/AuthContext.ts`
- Create: `src/modules/auth/AuthProvider.tsx`
- Create: `src/modules/auth/hooks/useAuth.ts`
- Modify: `src/modules/auth/constants.ts`
- Test: `src/modules/auth/AuthProvider.test.tsx`
- Create: `src/modules/auth/index.ts`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `register`, `login`, `fetchMe` from `./api/authApi`; `Credentials`, `User` from `./api/schemas`; `readAccessToken`, `writeAccessToken`, `clearAccessToken` from `./storage`; `configureAuthorization`, `ApiError`, `API_ERROR_CODES` from `@/services/http`.
- Produces, exported from `@/modules/auth`:
  - `AuthProvider` — a component taking only `children`
  - `useAuth(): AuthContextValue`
  - `AUTH_STATUSES = { LOADING: 'loading', SIGNED_OUT: 'signedOut', SIGNED_IN: 'signedIn' }`
  - types `AuthStatus`, `AuthContextValue`, `User`, `Credentials`
  - `AuthContextValue` is `{ status: AuthStatus; user: User | null; signIn: (c: Credentials) => Promise<void>; signUp: (c: Credentials) => Promise<void>; signOut: () => Promise<void>; isSubmitting: boolean }`

- [ ] **Step 1: Write the types and the context**

`src/modules/auth/types.ts`:

```ts
import type { Credentials, User } from './api/schemas';

export const AUTH_STATUSES = {
  LOADING: 'loading',
  SIGNED_OUT: 'signedOut',
  SIGNED_IN: 'signedIn',
} as const;

export type AuthStatus = (typeof AUTH_STATUSES)[keyof typeof AUTH_STATUSES];

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** Rejects with an `ApiError`; screens catch it and map `code` to copy. */
  signIn: (credentials: Credentials) => Promise<void>;
  signUp: (credentials: Credentials) => Promise<void>;
  signOut: () => Promise<void>;
  isSubmitting: boolean;
}
```

`src/modules/auth/AuthContext.ts`:

```ts
import { createContext } from 'react';

import type { AuthContextValue } from './types';

/** Its own file so the provider and the hook can both import it without a cycle. */
export const AuthContext = createContext<AuthContextValue | null>(null);
```

Append to `src/modules/auth/constants.ts`:

```ts
/** `as const` so TanStack Query sees a stable, literal key. */
export const AUTH_QUERY_KEYS = {
  ME: ['auth', 'me'],
} as const;
```

- [ ] **Step 2: Write the failing test**

`src/modules/auth/AuthProvider.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { API_ERROR_CODES, ApiError } from '@/services/http';

import { fetchMe, login, register } from './api/authApi';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './hooks/useAuth';
import { clearAccessToken, readAccessToken, writeAccessToken } from './storage';

jest.mock('./api/authApi');

const mockFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;
const mockLogin = login as jest.MockedFunction<typeof login>;
const mockRegister = register as jest.MockedFunction<typeof register>;

const TOKEN = 'a-signed-token';
const CREDENTIALS = { email: 'user@example.com', password: 'sup3rS3cret!' };
const PROFILE = {
  id: '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21',
  email: CREDENTIALS.email,
  emailVerifiedAt: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};

const SIGN_IN_LABEL = 'probe-sign-in';
const SIGN_UP_LABEL = 'probe-sign-up';
const SIGN_OUT_LABEL = 'probe-sign-out';

const Probe = () => {
  const { status, user, signIn, signUp, signOut } = useAuth();

  return (
    <>
      <Text>{`status:${status}`}</Text>
      <Text>{`user:${user?.email ?? 'none'}`}</Text>
      <Pressable
        onPress={() => {
          void signIn(CREDENTIALS).catch(() => undefined);
        }}
      >
        <Text>{SIGN_IN_LABEL}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void signUp(CREDENTIALS).catch(() => undefined);
        }}
      >
        <Text>{SIGN_UP_LABEL}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void signOut();
        }}
      >
        <Text>{SIGN_OUT_LABEL}</Text>
      </Pressable>
    </>
  );
};

const renderAuth = async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
};

beforeEach(async () => {
  jest.clearAllMocks();
  await clearAccessToken();
});

describe('AuthProvider', () => {
  it('boots signed out when the keychain is empty', async () => {
    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    expect(mockFetchMe).not.toHaveBeenCalled();
  });

  it('restores the session when the stored token still verifies', async () => {
    await writeAccessToken(TOKEN);
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();

    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    expect(await screen.findByText(`user:${PROFILE.email}`)).toBeTruthy();
  });

  it('clears a stored token the API rejects', async () => {
    await writeAccessToken(TOKEN);
    mockFetchMe.mockRejectedValue(
      new ApiError({
        status: 401,
        code: API_ERROR_CODES.INVALID_ACCESS_TOKEN,
        message: 'Invalid or expired access token',
      }),
    );

    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    await expect(readAccessToken()).resolves.toBeNull();
  });

  it('keeps the stored token when /auth/me fails for a network reason', async () => {
    await writeAccessToken(TOKEN);
    mockFetchMe.mockRejectedValue(
      new ApiError({
        status: 0,
        code: API_ERROR_CODES.NETWORK_ERROR,
        message: 'The request did not reach the API.',
      }),
    );

    await renderAuth();

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    // Being offline is not a reason to make the user type their password again
    // on the next launch.
    await expect(readAccessToken()).resolves.toBe(TOKEN);
  });

  it('signs in, stores the token and exposes the user', async () => {
    mockLogin.mockResolvedValue(TOKEN);
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();
    await screen.findByText('status:signedOut');
    await fireEvent.press(screen.getByText(SIGN_IN_LABEL));

    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    await expect(readAccessToken()).resolves.toBe(TOKEN);
  });

  it('signs up by registering and then logging in, because register issues no session', async () => {
    mockRegister.mockResolvedValue(PROFILE.id);
    mockLogin.mockResolvedValue(TOKEN);
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();
    await screen.findByText('status:signedOut');
    await fireEvent.press(screen.getByText(SIGN_UP_LABEL));

    expect(await screen.findByText('status:signedIn')).toBeTruthy();
    expect(mockRegister).toHaveBeenCalledWith(CREDENTIALS);
    expect(mockLogin).toHaveBeenCalledWith(CREDENTIALS);
  });

  it('signs out, clearing both the keychain and the user', async () => {
    await writeAccessToken(TOKEN);
    mockFetchMe.mockResolvedValue(PROFILE);

    await renderAuth();
    await screen.findByText('status:signedIn');
    await fireEvent.press(screen.getByText(SIGN_OUT_LABEL));

    expect(await screen.findByText('status:signedOut')).toBeTruthy();
    expect(await screen.findByText('user:none')).toBeTruthy();
    await expect(readAccessToken()).resolves.toBeNull();
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `pnpm exec jest src/modules/auth/AuthProvider.test.tsx`
Expected: FAIL — `Cannot find module './AuthProvider'`.

- [ ] **Step 4: Implement `src/modules/auth/AuthProvider.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { API_ERROR_CODES, ApiError, configureAuthorization } from '@/services/http';

import { fetchMe, login, register } from './api/authApi';
import type { Credentials, User } from './api/schemas';
import { AuthContext } from './AuthContext';
import { AUTH_QUERY_KEYS } from './constants';
import { clearAccessToken, readAccessToken, writeAccessToken } from './storage';
import { type AuthContextValue, AUTH_STATUSES, type AuthStatus } from './types';

/** A rejected token will be rejected again; retrying only delays the boot. */
const ME_RETRY_COUNT = 0;

interface StatusInput {
  hasCompletedBoot: boolean;
  token: string | null;
  user: User | undefined;
}

/**
 * `loading` means boot, and only boot — otherwise signing in would unmount the
 * sign-in screen into a full-screen splash mid-submit. And a token alone is not
 * a session: only `/auth/me` can say whether it still verifies.
 */
const resolveStatus = ({ hasCompletedBoot, token, user }: StatusInput): AuthStatus => {
  if (!hasCompletedBoot) return AUTH_STATUSES.LOADING;
  if (token === null || user === undefined) return AUTH_STATUSES.SIGNED_OUT;

  return AUTH_STATUSES.SIGNED_IN;
};

const isRejectedToken = (error: unknown): boolean =>
  error instanceof ApiError && error.code === API_ERROR_CODES.INVALID_ACCESS_TOKEN;

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [hasCompletedBoot, setHasCompletedBoot] = useState(false);
  // The registered `getAccessToken` has to read the CURRENT token without the
  // effect below re-running on every change, so state and ref move together.
  const tokenRef = useRef<string | null>(null);

  const applyToken = useCallback((next: string | null) => {
    tokenRef.current = next;
    setToken(next);
  }, []);

  const meQuery = useQuery({
    queryKey: AUTH_QUERY_KEYS.ME,
    queryFn: fetchMe,
    enabled: token !== null,
    retry: ME_RETRY_COUNT,
  });

  const endSession = useCallback(async () => {
    applyToken(null);
    await clearAccessToken();
    queryClient.removeQueries({ queryKey: AUTH_QUERY_KEYS.ME });
  }, [applyToken, queryClient]);

  useEffect(() => {
    configureAuthorization({
      getAccessToken: () => tokenRef.current,
      onUnauthorized: () => {
        void endSession();
      },
    });

    return () => configureAuthorization(null);
  }, [endSession]);

  // Boot: restore whatever the keychain holds, exactly once.
  useEffect(() => {
    let isMounted = true;

    const restore = async () => {
      const stored = await readAccessToken();

      if (!isMounted) return;

      applyToken(stored);
      // With no token there is nothing to verify, so boot is already over.
      if (stored === null) setHasCompletedBoot(true);
    };

    void restore();

    return () => {
      isMounted = false;
    };
  }, [applyToken]);

  // Boot ends when the restored token has been answered for, either way.
  useEffect(() => {
    if (hasCompletedBoot) return;
    if (meQuery.isSuccess || meQuery.isError) setHasCompletedBoot(true);
  }, [hasCompletedBoot, meQuery.isSuccess, meQuery.isError]);

  // A token the API rejected must not survive in the keychain. Only a rejected
  // token, though: being offline at launch is no reason to make the user type
  // their password again on the next one.
  useEffect(() => {
    if (tokenRef.current !== null && isRejectedToken(meQuery.error)) void endSession();
  }, [meQuery.error, endSession]);

  const establishSession = useCallback(
    async (credentials: Credentials) => {
      const accessToken = await login(credentials);

      await writeAccessToken(accessToken);
      applyToken(accessToken);
      // `fetchQuery`, not an invalidation: the user has to be in the cache
      // before this resolves, so the gate swaps in the same tick the screen
      // stops submitting.
      await queryClient.fetchQuery({ queryKey: AUTH_QUERY_KEYS.ME, queryFn: fetchMe });
    },
    [applyToken, queryClient],
  );

  const signInMutation = useMutation({ mutationFn: establishSession });

  const signUpMutation = useMutation({
    mutationFn: async (credentials: Credentials) => {
      // `POST /auth/register` answers 201 { id } and issues no session, so the
      // login is not optional: without it, creating an account would drop the
      // user straight back onto the sign-in screen.
      await register(credentials);
      await establishSession(credentials);
    },
  });

  const signOut = useCallback(async () => {
    await endSession();
    queryClient.clear();
  }, [endSession, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: resolveStatus({ hasCompletedBoot, token, user: meQuery.data }),
      user: meQuery.data ?? null,
      signIn: signInMutation.mutateAsync,
      signUp: signUpMutation.mutateAsync,
      signOut,
      isSubmitting: signInMutation.isPending || signUpMutation.isPending,
    }),
    [
      hasCompletedBoot,
      token,
      meQuery.data,
      signInMutation.mutateAsync,
      signInMutation.isPending,
      signUpMutation.mutateAsync,
      signUpMutation.isPending,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
```

- [ ] **Step 5: Implement `src/modules/auth/hooks/useAuth.ts`**

```ts
import { useContext } from 'react';

import { AuthContext } from '../AuthContext';
import type { AuthContextValue } from '../types';

const MISSING_PROVIDER_MESSAGE = 'useAuth was called outside of <AuthProvider>.';

/**
 * Throws rather than returning a signed-out value: a missing provider is a
 * wiring mistake, and reading as "signed out" would hide it behind a login
 * screen that can never succeed.
 */
export const useAuth = (): AuthContextValue => {
  const value = useContext(AuthContext);

  if (value === null) throw new Error(MISSING_PROVIDER_MESSAGE);

  return value;
};
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `pnpm exec jest src/modules/auth/AuthProvider.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 7: Write the module's public surface**

`src/modules/auth/index.ts` — everything the app is allowed to reach. The navigation exports are added in Task 7, when the files exist:

```ts
export type { Credentials, User } from './api/schemas';
export { AuthProvider } from './AuthProvider';
export { useAuth } from './hooks/useAuth';
export { type AuthContextValue, AUTH_STATUSES, type AuthStatus } from './types';
```

- [ ] **Step 8: Wire the providers in `App.tsx`**

Replace the body of `App.tsx` with:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';

import { AuthProvider } from '@/modules/auth';
import { RootNavigator } from '@/navigation';

/** `GestureHandlerRootView` needs a real style object — NativeWind cannot reach it. */
const ROOT_STYLE = { flex: 1 } as const;

const STATUS_BAR_STYLE = 'auto';

const QUERY_RETRY_COUNT = 1;
const QUERY_STALE_TIME_MS = 30000;

/**
 * Module scope on purpose: a client built inside the component would be thrown
 * away and rebuilt on every render, taking the cache with it.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: QUERY_RETRY_COUNT, staleTime: QUERY_STALE_TIME_MS } },
});

const App = () => (
  <GestureHandlerRootView style={ROOT_STYLE}>
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style={STATUS_BAR_STYLE} />
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  </GestureHandlerRootView>
);

export default App;
```

`AuthProvider` sits inside `QueryClientProvider` because it calls `useQueryClient`, and outside `RootNavigator` because the navigator reads the session to choose a stack.

- [ ] **Step 9: Verify and commit**

```bash
pnpm check && pnpm test:ci
git add src/modules/auth App.tsx
git commit -m "feat: hold the session and restore it on cold start"
```

---

### Task 6: Sign-in and sign-up screens

**Files:**
- Modify: `src/theme/tokens.js` (a `danger` semantic alias)
- Modify: `src/theme/README.md`
- Create: `src/modules/auth/navigation/constants.ts`
- Create: `src/modules/auth/navigation/types.ts`
- Create: `src/modules/auth/components/FormTextField.tsx`
- Create: `src/modules/auth/components/SubmitButton.tsx`
- Create: `src/modules/auth/errorCopy.ts`
- Create: `src/modules/auth/screens/SignInScreen.tsx`
- Test: `src/modules/auth/screens/SignInScreen.test.tsx`
- Create: `src/modules/auth/screens/SignUpScreen.tsx`
- Test: `src/modules/auth/screens/SignUpScreen.test.tsx`

**Interfaces:**
- Consumes: `useAuth` from `../hooks/useAuth`; `signInSchema`, `signUpSchema`, `Credentials` from `../api/schemas`; `ApiError`, `API_ERROR_CODES` from `@/services/http`.
- Produces (module-internal): `SignInScreen`, `SignUpScreen`, `FormTextField`, `SubmitButton`, `copyForError(error: unknown): string`, `applyServerFieldErrors(error, setError): void`, and `AUTH_ROUTES = { SIGN_IN: 'SignIn', SIGN_UP: 'SignUp' }` with `AuthStackParamList`.

- [ ] **Step 1: Add the `danger` semantic alias**

Field errors need a colour, and `AGENTS.md` §6 says screens use semantic aliases rather than raw scales. The `danger` scale already exists in `tokens.js`; only the alias is missing. Add to `semanticColors`:

```js
  danger: colors.danger[600],
  'danger-surface': colors.danger[50],
```

Add the pair to the alias table in `src/theme/README.md` in the same edit.

- [ ] **Step 2: Write the route constants and param list**

`src/modules/auth/navigation/constants.ts`:

```ts
/** This module's screens only. The root stack never learns these names. */
export const AUTH_ROUTES = {
  SIGN_IN: 'SignIn',
  SIGN_UP: 'SignUp',
} as const;

export type AuthRoute = (typeof AUTH_ROUTES)[keyof typeof AUTH_ROUTES];
```

`src/modules/auth/navigation/types.ts`:

```ts
import type { AUTH_ROUTES } from './constants';

export type AuthStackParamList = {
  [AUTH_ROUTES.SIGN_IN]: undefined;
  [AUTH_ROUTES.SIGN_UP]: undefined;
};
```

- [ ] **Step 3: Write the error-copy helpers**

`src/modules/auth/errorCopy.ts`:

```ts
import type { UseFormSetError } from 'react-hook-form';

import { API_ERROR_CODES, ApiError } from '@/services/http';

import type { Credentials } from './api/schemas';

const FORM_FIELDS = {
  EMAIL: 'email',
  PASSWORD: 'password',
} as const;

type FormField = (typeof FORM_FIELDS)[keyof typeof FORM_FIELDS];

/**
 * `code` is the API's stable contract and doubles as the i18n key. `message` is
 * for logs and must never reach the screen, so every code the user can cause
 * gets copy here.
 */
const COPY_BY_CODE: Readonly<Record<string, string>> = {
  [API_ERROR_CODES.INVALID_CREDENTIALS]: 'Email or password is incorrect.',
  [API_ERROR_CODES.EMAIL_ALREADY_IN_USE]: 'This email is already registered.',
  [API_ERROR_CODES.VALIDATION_ERROR]: 'Please check the fields above.',
  [API_ERROR_CODES.NETWORK_ERROR]: 'Could not reach the server. Check your connection.',
  [API_ERROR_CODES.INTERNAL_SERVER_ERROR]: 'The server had a problem. Please try again.',
};

/** A code with no entry must never leave the screen silent. */
const FALLBACK_COPY = 'Something went wrong. Please try again.';

const SERVER_FIELD_MESSAGE = 'The server rejected this value.';

export const copyForError = (error: unknown): string => {
  if (!(error instanceof ApiError)) return FALLBACK_COPY;

  return COPY_BY_CODE[error.code] ?? FALLBACK_COPY;
};

const isFormField = (field: string | undefined): field is FormField =>
  field === FORM_FIELDS.EMAIL || field === FORM_FIELDS.PASSWORD;

/**
 * Puts the API's per-field `details[]` where react-hook-form already renders
 * local errors, so server validation and client validation land in the same
 * place on the screen.
 */
export const applyServerFieldErrors = (
  error: unknown,
  setError: UseFormSetError<Credentials>,
): void => {
  if (!(error instanceof ApiError)) return;

  for (const detail of error.details) {
    if (isFormField(detail.field)) {
      setError(detail.field, { message: SERVER_FIELD_MESSAGE });
    }
  }
};
```

- [ ] **Step 4: Write the two form components**

`src/modules/auth/components/FormTextField.tsx`:

```tsx
import { type Control, Controller, type FieldValues, type Path } from 'react-hook-form';
import { Text, TextInput, View } from 'react-native';

export const FIELD_TYPES = {
  EMAIL: 'email',
  PASSWORD: 'password',
} as const;

export type FieldType = (typeof FIELD_TYPES)[keyof typeof FIELD_TYPES];

/** Keyboard behaviour belongs to the kind of field, not to each call site. */
const INPUT_PROPS_BY_TYPE = {
  [FIELD_TYPES.EMAIL]: {
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    autoComplete: 'email',
    secureTextEntry: false,
  },
  [FIELD_TYPES.PASSWORD]: {
    keyboardType: 'default',
    autoCapitalize: 'none',
    autoComplete: 'current-password',
    secureTextEntry: true,
  },
} as const;

interface FormTextFieldProps<TValues extends FieldValues> {
  control: Control<TValues>;
  name: Path<TValues>;
  label: string;
  type: FieldType;
}

export const FormTextField = <TValues extends FieldValues>({
  control,
  name,
  label,
  type,
}: FormTextFieldProps<TValues>) => (
  <Controller
    control={control}
    name={name}
    render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => (
      <View className="mb-4">
        <Text className="mb-1 text-sm font-medium text-content">{label}</Text>
        <TextInput
          accessibilityLabel={label}
          className="rounded-lg border border-border bg-surface px-3 py-3 text-base text-content"
          onBlur={onBlur}
          onChangeText={onChange}
          value={value ?? ''}
          {...INPUT_PROPS_BY_TYPE[type]}
        />
        {error?.message === undefined ? null : (
          <Text className="mt-1 text-sm text-danger">{error.message}</Text>
        )}
      </View>
    )}
  />
);
```

`src/modules/auth/components/SubmitButton.tsx`:

```tsx
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { colors } from '@/theme';

interface SubmitButtonProps {
  label: string;
  isPending: boolean;
  onPress: () => void;
}

export const SubmitButton = ({ label, isPending, onPress }: SubmitButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled: isPending }}
    className="items-center rounded-lg bg-primary px-4 py-3 active:bg-primary-pressed"
    disabled={isPending}
    onPress={onPress}
  >
    {isPending ? (
      <ActivityIndicator color={colors.neutral[0]} />
    ) : (
      <Text className="text-base font-semibold text-content-inverse">{label}</Text>
    )}
  </Pressable>
);
```

- [ ] **Step 5: Write the failing sign-in test**

`src/modules/auth/screens/SignInScreen.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { API_ERROR_CODES, ApiError } from '@/services/http';

import { useAuth } from '../hooks/useAuth';
import { SignInScreen } from './SignInScreen';

jest.mock('../hooks/useAuth');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const EMAIL_LABEL = 'Email';
const PASSWORD_LABEL = 'Password';
const SUBMIT_LABEL = 'Sign in';

const VALID_EMAIL = 'user@example.com';
const VALID_PASSWORD = 'sup3rS3cret!';

const navigation = { navigate: jest.fn() };

const mockSignIn = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    status: 'signedOut',
    user: null,
    signIn: mockSignIn,
    signUp: jest.fn(),
    signOut: jest.fn(),
    isSubmitting: false,
  });
});

const renderScreen = async () =>
  render(<SignInScreen navigation={navigation as never} route={{ key: 'k', name: 'SignIn' } as never} />);

const fillAndSubmit = async (email: string, password: string) => {
  await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
  await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), password);
  await fireEvent.press(screen.getByText(SUBMIT_LABEL));
};

describe('SignInScreen', () => {
  it('does not submit a malformed email', async () => {
    await renderScreen();
    await fillAndSubmit('not-an-email', VALID_PASSWORD);

    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('submits trimmed credentials when the form is valid', async () => {
    mockSignIn.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(`  ${VALID_EMAIL}  `, VALID_PASSWORD);

    expect(mockSignIn).toHaveBeenCalledWith({ email: VALID_EMAIL, password: VALID_PASSWORD });
  });

  it('shows the invalid-credentials copy on a 401, never the API message', async () => {
    mockSignIn.mockRejectedValue(
      new ApiError({
        status: 401,
        code: API_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL, VALID_PASSWORD);

    expect(await screen.findByText('Email or password is incorrect.')).toBeTruthy();
    expect(screen.queryByText('Invalid credentials')).toBeNull();
  });

  it('falls back to generic copy for a code it does not know', async () => {
    mockSignIn.mockRejectedValue(
      new ApiError({ status: 418, code: 'A_CODE_SHIPPED_LATER', message: 'internal detail' }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL, VALID_PASSWORD);

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();
  });

  it('navigates to sign-up', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Create an account'));

    expect(navigation.navigate).toHaveBeenCalledWith('SignUp');
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `pnpm exec jest src/modules/auth/screens/SignInScreen.test.tsx`
Expected: FAIL — `Cannot find module './SignInScreen'`.

- [ ] **Step 7: Implement `src/modules/auth/screens/SignInScreen.tsx`**

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';

import { type Credentials, signInSchema } from '../api/schemas';
import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
import { SubmitButton } from '../components/SubmitButton';
import { applyServerFieldErrors, copyForError } from '../errorCopy';
import { useAuth } from '../hooks/useAuth';
import { AUTH_ROUTES } from '../navigation/constants';
import type { AuthStackParamList } from '../navigation/types';

const COPY = {
  // Deliberately not 'Sign in': the submit button carries that label, and two
  // nodes with the same text make `getByText` ambiguous in the tests.
  title: 'Welcome back',
  emailLabel: 'Email',
  passwordLabel: 'Password',
  submitLabel: 'Sign in',
  switchToSignUp: 'Create an account',
} as const;

const EMPTY_FORM: Credentials = { email: '', password: '' };

type SignInScreenProps = NativeStackScreenProps<AuthStackParamList, typeof AUTH_ROUTES.SIGN_IN>;

export const SignInScreen = ({ navigation }: SignInScreenProps) => {
  const { signIn, isSubmitting } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<Credentials>({
    resolver: zodResolver(signInSchema),
    defaultValues: EMPTY_FORM,
  });

  const submit = handleSubmit(async (credentials) => {
    setFormError(null);

    try {
      await signIn(credentials);
    } catch (error) {
      // The API's `message` never reaches the screen — only copy chosen from
      // its `code`, plus whatever `details[]` maps onto a field.
      applyServerFieldErrors(error, setError);
      setFormError(copyForError(error));
    }
  });

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <Text className="mb-6 text-2xl font-semibold text-content">{COPY.title}</Text>

      <FormTextField
        control={control}
        label={COPY.emailLabel}
        name="email"
        type={FIELD_TYPES.EMAIL}
      />
      <FormTextField
        control={control}
        label={COPY.passwordLabel}
        name="password"
        type={FIELD_TYPES.PASSWORD}
      />

      {formError === null ? null : (
        <Text className="mb-4 rounded-lg bg-danger-surface p-3 text-sm text-danger">
          {formError}
        </Text>
      )}

      <SubmitButton isPending={isSubmitting} label={COPY.submitLabel} onPress={submit} />

      <Pressable className="mt-4 items-center" onPress={() => navigation.navigate(AUTH_ROUTES.SIGN_UP)}>
        <Text className="text-sm text-primary">{COPY.switchToSignUp}</Text>
      </Pressable>
    </View>
  );
};
```

- [ ] **Step 8: Run the sign-in test and confirm it passes**

Run: `pnpm exec jest src/modules/auth/screens/SignInScreen.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 9: Write the failing sign-up test**

`src/modules/auth/screens/SignUpScreen.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { API_ERROR_CODES, ApiError } from '@/services/http';

import { useAuth } from '../hooks/useAuth';
import { SignUpScreen } from './SignUpScreen';

jest.mock('../hooks/useAuth');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const EMAIL_LABEL = 'Email';
const PASSWORD_LABEL = 'Password';
const SUBMIT_LABEL = 'Create account';

const VALID_EMAIL = 'user@example.com';
const VALID_PASSWORD = 'sup3rS3cret!';

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const mockSignUp = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    status: 'signedOut',
    user: null,
    signIn: jest.fn(),
    signUp: mockSignUp,
    signOut: jest.fn(),
    isSubmitting: false,
  });
});

const renderScreen = async () =>
  render(<SignUpScreen navigation={navigation as never} route={{ key: 'k', name: 'SignUp' } as never} />);

const fillAndSubmit = async (email: string, password: string) => {
  await fireEvent.changeText(screen.getByLabelText(EMAIL_LABEL), email);
  await fireEvent.changeText(screen.getByLabelText(PASSWORD_LABEL), password);
  await fireEvent.press(screen.getByText(SUBMIT_LABEL));
};

describe('SignUpScreen', () => {
  it('enforces the API password policy before submitting', async () => {
    await renderScreen();
    await fillAndSubmit(VALID_EMAIL, 'password');

    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('submits a password that satisfies the policy', async () => {
    mockSignUp.mockResolvedValue(undefined);

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL, VALID_PASSWORD);

    expect(mockSignUp).toHaveBeenCalledWith({ email: VALID_EMAIL, password: VALID_PASSWORD });
  });

  it('shows the conflict copy when the email is taken', async () => {
    mockSignUp.mockRejectedValue(
      new ApiError({
        status: 409,
        code: API_ERROR_CODES.EMAIL_ALREADY_IN_USE,
        message: 'Email already in use',
      }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL, VALID_PASSWORD);

    expect(await screen.findByText('This email is already registered.')).toBeTruthy();
  });

  it('puts a server field error on the field it belongs to', async () => {
    mockSignUp.mockRejectedValue(
      new ApiError({
        status: 400,
        code: API_ERROR_CODES.VALIDATION_ERROR,
        message: 'Invalid payload',
        details: [{ field: 'email', code: 'invalid_format' }],
      }),
    );

    await renderScreen();
    await fillAndSubmit(VALID_EMAIL, VALID_PASSWORD);

    expect(await screen.findByText('The server rejected this value.')).toBeTruthy();
  });
});
```

- [ ] **Step 10: Implement `src/modules/auth/screens/SignUpScreen.tsx`**

Identical in shape to `SignInScreen`, with three differences: `signUpSchema` instead of `signInSchema` (the policy is enforced on registration), `signUp` instead of `signIn`, and the link goes back to sign-in.

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';

import { type Credentials, signUpSchema } from '../api/schemas';
import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
import { SubmitButton } from '../components/SubmitButton';
import { applyServerFieldErrors, copyForError } from '../errorCopy';
import { useAuth } from '../hooks/useAuth';
import { AUTH_ROUTES } from '../navigation/constants';
import type { AuthStackParamList } from '../navigation/types';

const COPY = {
  title: 'Create your account',
  emailLabel: 'Email',
  passwordLabel: 'Password',
  passwordHint: 'At least 8 characters, with a letter, a digit and a symbol.',
  submitLabel: 'Create account',
  switchToSignIn: 'I already have an account',
} as const;

const EMPTY_FORM: Credentials = { email: '', password: '' };

type SignUpScreenProps = NativeStackScreenProps<AuthStackParamList, typeof AUTH_ROUTES.SIGN_UP>;

export const SignUpScreen = ({ navigation }: SignUpScreenProps) => {
  const { signUp, isSubmitting } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<Credentials>({
    resolver: zodResolver(signUpSchema),
    defaultValues: EMPTY_FORM,
  });

  const submit = handleSubmit(async (credentials) => {
    setFormError(null);

    try {
      await signUp(credentials);
    } catch (error) {
      applyServerFieldErrors(error, setError);
      setFormError(copyForError(error));
    }
  });

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <Text className="mb-6 text-2xl font-semibold text-content">{COPY.title}</Text>

      <FormTextField
        control={control}
        label={COPY.emailLabel}
        name="email"
        type={FIELD_TYPES.EMAIL}
      />
      <FormTextField
        control={control}
        label={COPY.passwordLabel}
        name="password"
        type={FIELD_TYPES.PASSWORD}
      />
      <Text className="mb-4 text-sm text-content-muted">{COPY.passwordHint}</Text>

      {formError === null ? null : (
        <Text className="mb-4 rounded-lg bg-danger-surface p-3 text-sm text-danger">
          {formError}
        </Text>
      )}

      <SubmitButton isPending={isSubmitting} label={COPY.submitLabel} onPress={submit} />

      <Pressable className="mt-4 items-center" onPress={() => navigation.navigate(AUTH_ROUTES.SIGN_IN)}>
        <Text className="text-sm text-primary">{COPY.switchToSignIn}</Text>
      </Pressable>
    </View>
  );
};
```

- [ ] **Step 11: Run both screen tests and confirm they pass**

Run: `pnpm exec jest src/modules/auth/screens`
Expected: PASS, 9 tests across two files.

- [ ] **Step 12: Verify and commit**

```bash
pnpm check && pnpm test:ci
git add src/theme src/modules/auth
git commit -m "feat: add the sign-in and sign-up screens"
```

---

### Task 7: Navigation gate

Turns `src/navigation/` from a folder that lists screens into one that lists modules, and puts the session in charge of which side renders.

**Files:**
- Create: `src/modules/auth/navigation/AuthStack.tsx`
- Modify: `src/modules/auth/index.ts`
- Create: `src/screens/SplashScreen.tsx`
- Modify: `src/screens/index.ts`
- Modify: `src/navigation/constants.ts`
- Modify: `src/navigation/types.ts`
- Create: `src/navigation/RootStack.tsx`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/navigation/index.ts`
- Test: `src/navigation/RootNavigator.test.tsx`

**Interfaces:**
- Consumes: `SignInScreen`, `SignUpScreen`, `AUTH_ROUTES`, `AuthStackParamList` (module-internal); `useAuth`, `AUTH_STATUSES`, `AuthStack`, `AuthStackParamList` from `@/modules/auth`; the existing `AppStack`, `APP_ROUTES`, `AppStackParamList`.
- Produces: `ROOT_ROUTES = { AUTH: 'Auth', APP: 'App' }`, `RootStackParamList`, `RootStack`, and a `RootNavigator` that now gates on the session.

- [ ] **Step 1: Write the module's navigator**

`src/modules/auth/navigation/AuthStack.tsx`:

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SignInScreen } from '../screens/SignInScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { AUTH_ROUTES } from './constants';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

const SCREEN_OPTIONS = { headerShown: false } as const;

/** The signed-out flow. Everything it needs lives inside this module. */
export const AuthStack = () => (
  <Stack.Navigator screenOptions={SCREEN_OPTIONS}>
    <Stack.Screen name={AUTH_ROUTES.SIGN_IN} component={SignInScreen} />
    <Stack.Screen name={AUTH_ROUTES.SIGN_UP} component={SignUpScreen} />
  </Stack.Navigator>
);
```

Add the navigation exports to `src/modules/auth/index.ts`:

```ts
export { AuthStack } from './navigation/AuthStack';
export { AUTH_ROUTES, type AuthRoute } from './navigation/constants';
export type { AuthStackParamList } from './navigation/types';
```

- [ ] **Step 2: Write the splash screen**

`src/screens/SplashScreen.tsx` — it belongs to the app shell, not to auth: it is what shows while the session is still unknown, before any stack is chosen.

```tsx
import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/theme';

/** Shown only during boot, while the stored token is being verified. */
export const SplashScreen = () => (
  <View className="flex-1 items-center justify-center bg-background">
    <ActivityIndicator color={colors.brand[500]} />
  </View>
);
```

Add to `src/screens/index.ts`:

```ts
export { SplashScreen } from './SplashScreen';
```

- [ ] **Step 3: Add the root routes and param list**

`src/navigation/constants.ts` — keep `APP_ROUTES` exactly as it is and add:

```ts
/** One key per module, plus the signed-in shell. Screens never appear here. */
export const ROOT_ROUTES = {
  AUTH: 'Auth',
  APP: 'App',
} as const;

export type RootRoute = (typeof ROOT_ROUTES)[keyof typeof ROOT_ROUTES];
```

`src/navigation/types.ts` — keep `AppStackParamList`, add the root list, and move the global registration onto it:

```ts
import type { NavigatorScreenParams } from '@react-navigation/native';

import type { AuthStackParamList } from '@/modules/auth';

import type { APP_ROUTES, ROOT_ROUTES } from './constants';

/** Routes reachable in the signed-in shell. */
export type AppStackParamList = {
  [APP_ROUTES.HOME]: undefined;
};

/**
 * `NavigatorScreenParams` is what keeps a nested `navigate(ROOT_ROUTES.APP, {
 * screen: APP_ROUTES.HOME })` type-checked. Without it the nested `screen` is
 * unchecked.
 */
export type RootStackParamList = {
  [ROOT_ROUTES.AUTH]: NavigatorScreenParams<AuthStackParamList>;
  [ROOT_ROUTES.APP]: NavigatorScreenParams<AppStackParamList>;
};

/**
 * Makes `navigation.navigate()` type-safe anywhere without importing the
 * param lists by hand.
 */
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
```

- [ ] **Step 4: Write the root stack**

`src/navigation/RootStack.tsx`:

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AUTH_STATUSES, AuthStack, useAuth } from '@/modules/auth';

import { AppStack } from './AppStack';
import { ROOT_ROUTES } from './constants';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const SCREEN_OPTIONS = { headerShown: false } as const;

/**
 * One `Stack.Screen` per module, never per screen — a module's internals stop
 * at its own navigator.
 *
 * Only one side is rendered, rather than registering both and calling
 * `navigate`: that is what leaves no history for the Android back button to
 * walk into a signed-in screen after sign-out.
 */
export const RootStack = () => {
  const { status } = useAuth();

  return (
    <Stack.Navigator screenOptions={SCREEN_OPTIONS}>
      {status === AUTH_STATUSES.SIGNED_IN ? (
        <Stack.Screen name={ROOT_ROUTES.APP} component={AppStack} />
      ) : (
        <Stack.Screen name={ROOT_ROUTES.AUTH} component={AuthStack} />
      )}
    </Stack.Navigator>
  );
};
```

`src/navigation/RootNavigator.tsx`:

```tsx
import { NavigationContainer } from '@react-navigation/native';

import { AUTH_STATUSES, useAuth } from '@/modules/auth';
import { SplashScreen } from '@/screens';

import { RootStack } from './RootStack';

/**
 * The container is mounted only once the session is known. Rendering it during
 * boot would mean mounting a navigator whose first screen we would immediately
 * have to replace.
 */
export const RootNavigator = () => {
  const { status } = useAuth();

  if (status === AUTH_STATUSES.LOADING) return <SplashScreen />;

  return (
    <NavigationContainer>
      <RootStack />
    </NavigationContainer>
  );
};
```

`src/navigation/index.ts`:

```ts
export type { AppRoute, RootRoute } from './constants';
export { APP_ROUTES, ROOT_ROUTES } from './constants';
export { RootNavigator } from './RootNavigator';
export type { AppStackParamList, RootStackParamList } from './types';
```

- [ ] **Step 5: Write the gate test**

`src/navigation/RootNavigator.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';

import { AUTH_STATUSES } from '@/modules/auth';
import { useAuth } from '@/modules/auth/hooks/useAuth';

import { RootNavigator } from './RootNavigator';

/**
 * The deep path, not the barrel: the screens import `../hooks/useAuth`
 * directly, so mocking `@/modules/auth` would leave the real hook running
 * inside `SignInScreen` and throw for a missing provider. Mocking the file
 * itself covers both importers, since the barrel re-exports this same module.
 */
jest.mock('@/modules/auth/hooks/useAuth');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const sessionWith = (status: string) =>
  ({
    status,
    user: null,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    isSubmitting: false,
  }) as never;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RootNavigator', () => {
  it('shows neither stack while the session is still unknown', async () => {
    mockUseAuth.mockReturnValue(sessionWith(AUTH_STATUSES.LOADING));

    await render(<RootNavigator />);

    expect(screen.queryByText('Welcome back')).toBeNull();
    expect(screen.queryByText('Signed-in area')).toBeNull();
  });

  it('renders the auth stack when signed out', async () => {
    mockUseAuth.mockReturnValue(sessionWith(AUTH_STATUSES.SIGNED_OUT));

    await render(<RootNavigator />);

    expect(await screen.findByText('Welcome back')).toBeTruthy();
    expect(screen.queryByText('Signed-in area')).toBeNull();
  });

  it('renders the app stack when signed in', async () => {
    mockUseAuth.mockReturnValue(sessionWith(AUTH_STATUSES.SIGNED_IN));

    await render(<RootNavigator />);

    expect(await screen.findByText('Signed-in area')).toBeTruthy();
    expect(screen.queryByText('Create an account')).toBeNull();
  });
});
```

- [ ] **Step 6: Run the gate test and confirm it passes**

Run: `pnpm exec jest src/navigation/RootNavigator.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 7: Verify and commit**

```bash
pnpm check && pnpm test:ci
git add src/modules/auth src/navigation src/screens
git commit -m "feat: gate navigation on the session"
```

---

### Task 8: Documentation

The code is done; this task makes the repository describe it honestly. Nothing here changes behaviour, so there is no test cycle — the gate is that every claim matches the code.

**Files:**
- Create: `src/modules/auth/README.md`
- Modify: `src/modules/README.md`
- Modify: `src/navigation/README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `README.md`

- [ ] **Step 1: Write `src/modules/auth/README.md`**

```md
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
```

- [ ] **Step 2: Update `src/modules/README.md`**

Replace `_Nenhum ainda._ Adicione um módulo criando uma pasta aqui que siga o formato acima.` with:

```md
| Name   | Description                                                          |
| ------ | ---------------------------------------------------------------------- |
| `auth` | Sessão do app: cadastro, login, restauração no boot, logout e o estado que a navegação consulta. |
```

Also add `navigation/` to the folder sketch at the top of that file, since `auth` establishes it as the pattern:

```
  navigation/   rotas, tipos de parâmetro e o navigator deste módulo
```

- [ ] **Step 3: Update `src/navigation/README.md`**

Rewrite the `## Components`, `## Constants`, `## Types` tables to cover `RootNavigator`, `RootStack`, `AppStack`, `ROOT_ROUTES`, `APP_ROUTES`, `RootStackParamList`, `AppStackParamList`, and replace the `## Current state` section — which currently says "sem gate de autenticação" — with the real behaviour:

```md
## Current state

`RootNavigator` mostra o `SplashScreen` enquanto a sessão é desconhecida
(`AUTH_STATUSES.LOADING`) e só então monta o `NavigationContainer`. O
`RootStack` renderiza **um lado só**: `AuthStack` quando deslogado, `AppStack`
quando logado. Renderizar só um lado — em vez de registrar os dois e navegar —
é o que deixa o botão voltar do Android sem histórico para retornar a uma tela
logada depois do logout.

Este módulo lista **módulos, não telas**. Adicionar uma tela a um módulo toca
apenas o `navigation/` daquele módulo. Adicionar um módulo novo toca o trio
dele mais uma linha em cada um dos três arquivos daqui.
```

- [ ] **Step 4: Update `ARCHITECTURE.md`**

Four edits, all of them replacing claims that are now false:

1. **§1** — replace "Hoje **não há nenhum módulo** em `src/modules/`" with the fact that `auth` exists and is the reference for the next one, and drop "quando a API estiver pronta".
2. **§2** — add to the tree: `src/config/`, `src/services/http/`, the full `src/modules/auth/` subtree, `src/screens/SplashScreen.tsx`, `src/navigation/RootStack.tsx`, `jest.setup.ts`, `.env.example`. Add a row to the module-boundary table for `services/` (sabe de rede, não sabe de React nem de módulos) and for `config/`.
3. **§6** — replace the "Estado atual" block with the composition-root structure and the gate, matching what Step 3 wrote in the navigation README. Keep the "adicionar uma tela são três edições" rule but scope it to the module's own trio.
4. **§10** — remove what now exists (módulo de domínio, cliente HTTP, `useAuth()`/`AuthProvider`, `expo-secure-store`, telas de sign-in/sign-up, navegação condicional, estados de erro e loading, validação de formulário, variáveis de ambiente). Keep, and keep listed as absent: refresh de token, logout no servidor, password reset, verificação de e-mail, `src/components/` compartilhado, `src/hooks/`, `src/store/`, flow de E2E no Maestro, fronteira de módulo verificada por lint.

Also update the **Stack hoje** line at the top with TanStack Query, react-hook-form, zod and expo-secure-store.

- [ ] **Step 5: Update `README.md`**

Three edits:

1. **Status** — replace "Ainda sem autenticação — o backend ... ainda não está pronto" with a line saying auth is implemented against `api-clean-platform`, minus refresh.
2. **Começando** — add the `.env` step before `pnpm start`:

```bash
cp .env.example .env    # e ajuste EXPO_PUBLIC_API_URL se a API não estiver em localhost:3000
```

3. **Roadmap** — check off **Auth**, rewriting the item to say what was built and to name refresh/logout as deferred to the API. Leave **Polimento** open, minus the parts now done (estados de erro e loading, validação de formulário, variáveis de ambiente).

- [ ] **Step 6: Verify and commit**

```bash
pnpm check && pnpm test:ci
git add README.md ARCHITECTURE.md src
git commit -m "docs: describe the auth module and the navigation gate"
```

---

## Verification

Runnable in this environment, after every task:

```bash
pnpm check      # tsc --noEmit && biome check
pnpm test:ci    # jest --ci
```

**Not runnable here, and must not be claimed:** this is WSL2 with no Xcode, no Android SDK and no Maestro CLI, and the API needs a running Postgres. Nothing in this plan proves the app talks to a live `api-clean-platform`. That verification is a separate, manual pass on a machine with a dev client and the API up:

1. `docker compose up -d` and `pnpm dev` in `api-clean-platform`.
2. `cp .env.example .env` here, pointing at that instance (`10.0.2.2` on an Android emulator).
3. `pnpm e2e:build:ios` or `pnpm e2e:build:android`, then `pnpm start`.
4. Create an account, force-quit, reopen — the session must survive. Sign out — the back button must not return to `Home`.

## Out of scope

Everything the spec defers: token refresh, server-side logout, password reset, email verification, social login, biometrics, i18n beyond the `errorCopy.ts` seam, a shared `src/components/` library, Maestro flows, and CI.
