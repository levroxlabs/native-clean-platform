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
