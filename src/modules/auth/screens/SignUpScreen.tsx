import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';

import { copyForError } from '@/errors';

import { startSignUp } from '../api/authApi';
import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
import { SubmitButton } from '../components/SubmitButton';
import { applyServerFieldErrors } from '../errorCopy';
import type { AuthStackParamList } from '../navigation/types';
import { type SignUpValues, signUpSchema } from '../validations';

const COPY = {
  title: 'Create your account',
  subtitle: 'We will email you a six-digit code to confirm this address.',
  emailLabel: 'Email',
  submitLabel: 'Send the code',
  switchToSignIn: 'I already have an account',
} as const;

/** Checked against `SignUpValues` by `Path<T>`, so a typo here is a compile error. */
const FIELDS = ['email'] as const;

const EMPTY_FORM: SignUpValues = { email: '' };

type SignUpScreenProps = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

/**
 * Step 1 of three. It creates no account and opens no session: the API records
 * a pending registration and emails a code, and `VerifyEmail` is where the
 * account is actually born.
 */
export const SignUpScreen = ({ navigation }: SignUpScreenProps) => {
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: EMPTY_FORM,
  });

  const startSignUpMutation = useMutation({
    // Wrapped rather than passed by reference: TanStack Query calls `mutationFn`
    // with a second argument of its own.
    mutationFn: (email: string) => startSignUp(email),
    networkMode: 'always',
  });

  const submit = handleSubmit(async ({ email }) => {
    setFormError(null);

    try {
      await startSignUpMutation.mutateAsync(email);
      // Nothing branches on the answer, and nothing may: the API replies 202 to
      // a free address, to one already registering, and to one that already has
      // an account. A condition here would rebuild the account enumeration the
      // API deliberately removed. What differs is the email the address gets.
      navigation.navigate('VerifyEmail', { email });
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
        isPending={startSignUpMutation.isPending}
        label={COPY.submitLabel}
        onPress={submit}
      />

      <Pressable className="mt-4 items-center" onPress={() => navigation.navigate('SignIn')}>
        <Text className="text-sm text-primary">{COPY.switchToSignIn}</Text>
      </Pressable>
    </View>
  );
};
