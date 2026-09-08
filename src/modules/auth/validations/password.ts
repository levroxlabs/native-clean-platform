import { z } from 'zod';

import {
  CONFIRM_PASSWORD_FIELD,
  emailSchema,
  newPasswordSchema,
  resetTokenSchema,
  submittedPasswordSchema,
  VALIDATION_COPY,
} from './policy';

export const forgotPasswordSchema = z.object({ email: emailSchema });

/**
 * No email: the API's body is `{ token, newPassword }` and `.strict()`. The
 * address the recovery started from is carried as a route param, for the sign-in
 * form the user lands on afterwards.
 */
export const resetPasswordSchema = z
  .object({
    token: resetTokenSchema,
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: VALIDATION_COPY.passwordMismatch,
    path: [CONFIRM_PASSWORD_FIELD],
  });

/**
 * `currentPassword` is presence-only, exactly as `signInSchema` is and for the
 * same reason. Whether it is the right one is a 422 the API owns.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: submittedPasswordSchema,
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: VALIDATION_COPY.passwordMismatch,
    path: [CONFIRM_PASSWORD_FIELD],
  });

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
