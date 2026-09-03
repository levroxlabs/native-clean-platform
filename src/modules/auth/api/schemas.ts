import { z } from 'zod';

/** Presence, not shape: the client has no business asserting JWT structure. */
const MIN_ACCESS_TOKEN_LENGTH = 1;

export const registerResponseSchema = z.object({ id: z.uuid() });

export const loginResponseSchema = z.object({
  accessToken: z.string().min(MIN_ACCESS_TOKEN_LENGTH),
});

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
