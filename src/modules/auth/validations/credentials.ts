import { z } from 'zod';

import { emailSchema, submittedPasswordSchema } from './policy';

/**
 * Step 1 of sign-up takes the address alone. The password is chosen at
 * confirmation, where the API requires it: the code reaches only the owner of
 * the address, so whoever confirms is whoever chooses the password. Collecting
 * it here would also mean a plaintext password sitting in navigation state
 * until step 3.
 */
export const signUpSchema = z.object({ email: emailSchema });

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
