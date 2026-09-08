import { z } from 'zod';

import {
  CONFIRM_PASSWORD_FIELD,
  emailSchema,
  newPasswordSchema,
  VALIDATION_COPY,
  verificationCodeSchema,
} from './policy';

/**
 * Step 2 of sign-up. `password` is named as the API names it, so a `details[]`
 * entry from a 400 lands on the input the user is looking at.
 *
 * `confirmPassword` never leaves the client: the API's body has no place for
 * it. It is here because this form is the only chance to catch a typo before
 * the password becomes the account's.
 */
export const confirmSignUpSchema = z
  .object({
    email: emailSchema,
    code: verificationCodeSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: VALIDATION_COPY.passwordMismatch,
    path: [CONFIRM_PASSWORD_FIELD],
  });

export type ConfirmSignUpValues = z.infer<typeof confirmSignUpSchema>;
