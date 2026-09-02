import { z } from 'zod';

/** All four mirror the API's value objects — keep them in step. */
export const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_POLICY_PATTERN = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/s;

/** Presence only, as on the server: see `signInSchema` below. */
const MIN_SUBMITTED_PASSWORD_LENGTH = 1;

/** Presence, not shape: the client has no business asserting JWT structure. */
const MIN_ACCESS_TOKEN_LENGTH = 1;

/**
 * Rendered straight to the user by react-hook-form, so these are copy, not
 * diagnostics: zod's defaults read like "Too small: expected string to have
 * >=8 characters". They live beside the rules they describe, and together with
 * `errorCopy.ts` they are the whole i18n seam of this module.
 */
const VALIDATION_COPY = {
  email: 'Enter a valid email address.',
  passwordLength: `Use between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
  passwordPolicy: 'Include a letter, a digit and a symbol.',
  passwordRequired: 'Enter your password.',
} as const;

const emailSchema = z
  .string()
  .trim()
  .max(MAX_EMAIL_LENGTH, VALIDATION_COPY.email)
  .pipe(z.email(VALIDATION_COPY.email));

/** Registration enforces the policy the API publishes. */
export const signUpSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, VALIDATION_COPY.passwordLength)
    .max(MAX_PASSWORD_LENGTH, VALIDATION_COPY.passwordLength)
    .regex(PASSWORD_POLICY_PATTERN, VALIDATION_COPY.passwordPolicy),
});

/**
 * Sign-in checks presence, not policy — the same choice the API makes and for
 * the same reason: an account created under a looser policy must stay able to
 * log in, and rejecting locally would tell the user their password is malformed
 * when the truth is that it is wrong. The maximum stays only to bound the body.
 */
export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(MIN_SUBMITTED_PASSWORD_LENGTH, VALIDATION_COPY.passwordRequired)
    .max(MAX_PASSWORD_LENGTH, VALIDATION_COPY.passwordLength),
});

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

export type Credentials = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type User = z.infer<typeof userSchema>;
