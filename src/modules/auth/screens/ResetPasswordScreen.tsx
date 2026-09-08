import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';

import { copyForError } from '@/errors';

import { resetPassword } from '../api/authApi';
import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
import { SubmitButton } from '../components/SubmitButton';
import { applyServerFieldErrors } from '../errorCopy';
import type { AuthStackParamList } from '../navigation/types';
import { type ResetPasswordValues, resetPasswordSchema } from '../validations';

const COPY = {
  title: 'Choose a new password',
  subtitle: 'Paste the token from the email, then pick a new password.',
  tokenLabel: 'Reset token',
  newPasswordLabel: 'New password',
  confirmPasswordLabel: 'Confirm password',
  passwordHint: 'At least 8 characters, with a letter, a digit and a symbol.',
  submitLabel: 'Reset password',
  backToSignIn: 'Back to sign in',
} as const;

/**
 * Checked against `ResetPasswordValues` by `Path<T>`. `confirmPassword` is
 * absent: the API has no such field, so it can never appear in `details[]`.
 */
const FIELDS = ['token', 'newPassword'] as const;

const EMPTY_FORM: ResetPasswordValues = { token: '', newPassword: '', confirmPassword: '' };

type ResetPasswordScreenProps = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export const ResetPasswordScreen = ({ navigation, route }: ResetPasswordScreenProps) => {
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: EMPTY_FORM,
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (input: { token: string; newPassword: string }) => resetPassword(input),
    networkMode: 'always',
  });

  const submit = handleSubmit(async ({ token, newPassword }) => {
    setFormError(null);

    try {
      // `confirmPassword` stays here: the API's body is `{ token, newPassword }`
      // and `.strict()`, so sending it would be a 400.
      await resetPasswordMutation.mutateAsync({ token, newPassword });
      // 204 with no tokens: the API revoked every session of the account, this
      // device included. Signing in again is the only way forward, so the form
      // is handed the address the recovery started from.
      navigation.navigate('SignIn', { email: route.params.email });
    } catch (error) {
      applyServerFieldErrors(error, setError, FIELDS);
      setFormError(copyForError(error));
    }
  });

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <Text className="mb-1 text-2xl font-semibold text-content">{COPY.title}</Text>
      <Text className="mb-6 text-sm text-content-muted">{COPY.subtitle}</Text>

      <FormTextField
        control={control}
        label={COPY.tokenLabel}
        name="token"
        type={FIELD_TYPES.TOKEN}
      />
      <FormTextField
        control={control}
        label={COPY.newPasswordLabel}
        name="newPassword"
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

      <SubmitButton
        isPending={resetPasswordMutation.isPending}
        label={COPY.submitLabel}
        onPress={submit}
      />

      <Pressable className="mt-4 items-center" onPress={() => navigation.navigate('SignIn')}>
        <Text className="text-sm text-primary">{COPY.backToSignIn}</Text>
      </Pressable>
    </View>
  );
};
