import { z } from 'zod';

import { emailSchema, newPasswordSchema, submittedPasswordSchema } from './policy';

/** Registration enforces the policy the API publishes. */
export const signUpSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
});

/**
 * Sign-in checks presence, not policy — the same choice the API makes and for
 * the same reason: an account created under a looser policy must stay able to
 * log in, and rejecting locally would tell the user their password is malformed
 * when the truth is that it is wrong.
 */
export const signInSchema = z.object({
  email: emailSchema,
  password: submittedPasswordSchema,
});

export type Credentials = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
