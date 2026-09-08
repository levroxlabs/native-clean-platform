import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';

import { copyForError } from '@/errors';

import { resendVerificationCode } from '../api/authApi';
import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
import { SubmitButton } from '../components/SubmitButton';
import { applyServerFieldErrors } from '../errorCopy';
import { useAuth } from '../hooks/useAuth';
import { RESEND_COOLDOWN_SECONDS, useResendCooldown } from '../hooks/useResendCooldown';
import type { AuthStackParamList } from '../navigation/types';
import { type ConfirmSignUpValues, confirmSignUpSchema } from '../validations';

const COPY = {
  title: 'Confirm your email',
  subtitle: 'Enter the six-digit code we emailed you, and choose a password.',
  emailLabel: 'Email',
  codeLabel: 'Verification code',
  passwordLabel: 'Password',
  confirmPasswordLabel: 'Confirm password',
  passwordHint: 'At least 8 characters, with a letter, a digit and a symbol.',
  submitLabel: 'Create account',
  resendLabel: 'Send a new code',
  backToSignIn: 'Back to sign in',
} as const;

const resendCountdownLabel = (seconds: number) => `${COPY.resendLabel} in ${seconds}s`;

/**
 * Checked against `ConfirmSignUpValues` by `Path<T>`, so a typo is a compile
 * error. `confirmPassword` is absent on purpose: the API has no such field, so
 * it can never appear in a `details[]` entry.
 */
const FIELDS = ['email', 'code', 'password'] as const;

/** No code was just sent, so the resend is available immediately. */
const NO_COOLDOWN = 0;

type VerifyEmailScreenProps = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;

export const VerifyEmailScreen = ({ navigation, route }: VerifyEmailScreenProps) => {
  const { confirmSignUp, isSubmitting } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const { control, getValues, handleSubmit, setError } = useForm<ConfirmSignUpValues>({
    resolver: zodResolver(confirmSignUpSchema),
    // Pre-filled but editable: a typo means the code went to someone else's
    // inbox, and a locked field would leave no way back but to restart.
    defaultValues: {
      email: route.params?.email ?? '',
      code: '',
      password: '',
      confirmPassword: '',
    },
  });

  // Arriving WITH an address means `SignUp` just sent a code, so the cooldown is
  // already running. Arriving from the "I already have a code" link, nothing was
  // sent here and the resend is available at once.
  const { secondsLeft, restart } = useResendCooldown(
    route.params?.email === undefined ? NO_COOLDOWN : RESEND_COOLDOWN_SECONDS,
  );

  const resendMutation = useMutation({
    // Wrapped rather than passed by reference: TanStack Query calls `mutationFn`
    // with a second argument of its own, and forwarding it into the API layer
    // would leak the query client's internals into a request.
    mutationFn: (email: string) => resendVerificationCode(email),
    networkMode: 'always',
  });

  const resend = async () => {
    setFormError(null);

    try {
      await resendMutation.mutateAsync(getValues('email'));
      // Restarted once the call RESOLVED, without asking what the API did with
      // it: a resend inside the server's own cooldown answers 202 and sends
      // nothing, indistinguishable from one that worked. A rejection is a
      // different thing — the request failed, which is not a difference the API
      // is hiding — so the button stays available.
      restart();
    } catch (error) {
      setFormError(copyForError(error));
    }
  };

  const submit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      // Nothing navigates on success: `RootStack` renders one side or the
      // other, so opening the session unmounts this screen on its own.
      await confirmSignUp(values);
    } catch (error) {
      applyServerFieldErrors(error, setError, FIELDS);
      setFormError(copyForError(error));
    }
  });

  const isCoolingDown = secondsLeft !== NO_COOLDOWN;
  const isResendBlocked = isCoolingDown || resendMutation.isPending;

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <Text className="mb-1 text-2xl font-semibold text-content">{COPY.title}</Text>
      <Text className="mb-6 text-sm text-content-muted">{COPY.subtitle}</Text>

      <FormTextField
        control={control}
        label={COPY.emailLabel}
        name="email"
        type={FIELD_TYPES.EMAIL}
      />
      <FormTextField control={control} label={COPY.codeLabel} name="code" type={FIELD_TYPES.CODE} />
      <FormTextField
        control={control}
        label={COPY.passwordLabel}
        name="password"
        type={FIELD_TYPES.NEW_PASSWORD}
      />
      <FormTextField
        control={control}
        label={COPY.confirmPasswordLabel}
        name="confirmPassword"
        type={FIELD_TYPES.NEW_PASSWORD}
      />
      <Text className="mb-4 text-sm text-content-muted">{COPY.passwordHint}</Text>

      {formError === null ? null : (
        <Text className="mb-4 rounded-lg bg-danger-surface p-3 text-sm text-danger">
          {formError}
        </Text>
      )}

      <SubmitButton isPending={isSubmitting} label={COPY.submitLabel} onPress={submit} />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isResendBlocked }}
        className="mt-4 items-center"
        disabled={isResendBlocked}
        onPress={() => {
          void resend();
        }}
      >
        <Text className="text-sm text-primary">
          {isCoolingDown ? resendCountdownLabel(secondsLeft) : COPY.resendLabel}
        </Text>
      </Pressable>

      <Pressable className="mt-4 items-center" onPress={() => navigation.navigate('SignIn')}>
        <Text className="text-sm text-primary">{COPY.backToSignIn}</Text>
      </Pressable>
    </View>
  );
};
