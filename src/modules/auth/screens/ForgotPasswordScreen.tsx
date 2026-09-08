import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';

import { copyForError } from '@/errors';

import { requestPasswordReset } from '../api/authApi';
import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
import { SubmitButton } from '../components/SubmitButton';
import { applyServerFieldErrors } from '../errorCopy';
import type { AuthStackParamList } from '../navigation/types';
import { type ForgotPasswordValues, forgotPasswordSchema } from '../validations';

const COPY = {
  title: 'Reset your password',
  // Says out loud what the API does, which is what lets this screen advance
  // unconditionally without misleading anyone.
  subtitle:
    'Enter your address and we will email you a token. If the address has no account, nothing is sent.',
  emailLabel: 'Email',
  submitLabel: 'Send the token',
  backToSignIn: 'Back to sign in',
} as const;

/** Checked against `ForgotPasswordValues` by `Path<T>`. */
const FIELDS = ['email'] as const;

const EMPTY_FORM: ForgotPasswordValues = { email: '' };

type ForgotPasswordScreenProps = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export const ForgotPasswordScreen = ({ navigation }: ForgotPasswordScreenProps) => {
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: EMPTY_FORM,
  });

  const requestResetMutation = useMutation({
    mutationFn: (email: string) => requestPasswordReset(email),
    networkMode: 'always',
  });

  const submit = handleSubmit(async ({ email }) => {
    setFormError(null);

    try {
      await requestResetMutation.mutateAsync(email);
      // Unconditional, and it has to be: the API answers 202 whether or not the
      // address has an account. A branch here would be the account oracle the
      // API refuses to be.
      navigation.navigate('ResetPassword', { email });
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
        label={COPY.emailLabel}
        name="email"
        type={FIELD_TYPES.EMAIL}
      />

      {formError === null ? null : (
        <Text className="mb-4 rounded-lg bg-danger-surface p-3 text-sm text-danger">
          {formError}
        </Text>
      )}

      <SubmitButton
        isPending={requestResetMutation.isPending}
        label={COPY.submitLabel}
        onPress={submit}
      />

      <Pressable className="mt-4 items-center" onPress={() => navigation.navigate('SignIn')}>
        <Text className="text-sm text-primary">{COPY.backToSignIn}</Text>
      </Pressable>
    </View>
  );
};
