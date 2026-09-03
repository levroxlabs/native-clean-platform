export type ErrorReporter = (error: unknown) => void;

let reporter: ErrorReporter | null = null;

/**
 * The seam between TanStack Query's global cache callbacks — configured at
 * module scope, where React context does not exist — and the toast, which is a
 * React provider. `ErrorToastProvider` registers on mount and clears on
 * unmount, the same shape `AuthProvider` uses with `configureAuthorization`.
 */
export const configureErrorReporter = (next: ErrorReporter | null): void => {
  reporter = next;
};

/** A no-op with nothing registered: this runs inside an error handler already. */
export const reportError = (error: unknown): void => {
  reporter?.(error);
};
