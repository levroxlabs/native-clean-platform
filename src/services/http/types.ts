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
