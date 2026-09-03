import { z } from 'zod';

/** Presence, not shape: the client has no business asserting JWT structure. */
const MIN_TOKEN_LENGTH = 1;

export const registerResponseSchema = z.object({ id: z.uuid() });

/**
 * What `login` and `refresh` both answer.
 *
 * `refreshToken` is required here and optional in the API's own schema: the API
 * publishes one shape for both transports, and this client always asks for body
 * transport (see `authApi.ts`). An answer without it is drift.
 */
export const sessionTokensSchema = z.object({
  accessToken: z.string().min(MIN_TOKEN_LENGTH),
  refreshToken: z.string().min(MIN_TOKEN_LENGTH),
});

export type SessionTokens = z.infer<typeof sessionTokensSchema>;

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

export type User = z.infer<typeof userSchema>;
