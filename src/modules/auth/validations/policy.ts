import { z } from 'zod';

/** All six mirror the API's value objects and route schemas — keep them in step. */
export const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_POLICY_PATTERN = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/s;
export const VERIFICATION_CODE_DIGITS = 6;
/**
 * base64url in a generous band. The exact length is an adapter detail on the API
 * side (32 random bytes, so 43 characters today), and this is SHAPE only —
 * whether the token is real, or still usable, is the API's single
 * `PASSWORD_RESET_FAILED` to give.
 */
export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

/** The field every new-password form compares against. Typed by `Path<T>` at each use. */
export const CONFIRM_PASSWORD_FIELD = 'confirmPassword';

/** Presence only, as on the server: see `signInSchema` in `credentials.ts`. */
const MIN_SUBMITTED_PASSWORD_LENGTH = 1;

const VERIFICATION_CODE_PATTERN = new RegExp(`^[0-9]{${VERIFICATION_CODE_DIGITS}}$`);

/**
 * Rendered straight to the user by react-hook-form, so these are copy, not
 * diagnostics: zod's defaults read like "Too small: expected string to have
 * >=8 characters". They live beside the rules they describe, and together with
 * `errorCopy.ts` they are the whole i18n seam of this module.
 */
export const VALIDATION_COPY = {
  email: 'Enter a valid email address.',
  passwordLength: `Use between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
  passwordPolicy: 'Include a letter, a digit and a symbol.',
  passwordRequired: 'Enter your password.',
  code: `Enter the ${VERIFICATION_CODE_DIGITS}-digit code from your email.`,
  token: 'Paste the token from the email we sent you.',
  passwordMismatch: 'The two passwords do not match.',
} as const;

export const emailSchema = z
  .string()
  .trim()
  .max(MAX_EMAIL_LENGTH, VALIDATION_COPY.email)
  .pipe(z.email(VALIDATION_COPY.email));

/** The full registration policy. Used wherever the user CHOOSES a password. */
export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, VALIDATION_COPY.passwordLength)
  .max(MAX_PASSWORD_LENGTH, VALIDATION_COPY.passwordLength)
  .regex(PASSWORD_POLICY_PATTERN, VALIDATION_COPY.passwordPolicy);

/** Presence and a ceiling. Used wherever the user PROVES a password they already have. */
export const submittedPasswordSchema = z
  .string()
  .min(MIN_SUBMITTED_PASSWORD_LENGTH, VALIDATION_COPY.passwordRequired)
  .max(MAX_PASSWORD_LENGTH, VALIDATION_COPY.passwordLength);

/** Shape only. Whether the code is the right one is the API's to answer. */
export const verificationCodeSchema = z
  .string()
  .trim()
  .regex(VERIFICATION_CODE_PATTERN, VALIDATION_COPY.code);

/** Shape only, for the same reason as the code. */
export const resetTokenSchema = z.string().trim().regex(RESET_TOKEN_PATTERN, VALIDATION_COPY.token);
