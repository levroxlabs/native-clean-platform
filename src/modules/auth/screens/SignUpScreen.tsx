import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';

import { type Credentials, signUpSchema } from '../api/schemas';
import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
import { SubmitButton } from '../components/SubmitButton';
import { applyServerFieldErrors, copyForError } from '../errorCopy';
import { useAuth } from '../hooks/useAuth';
import { AUTH_ROUTES } from '../navigation/constants';
import type { AuthStackParamList } from '../navigation/types';

const COPY = {
  title: 'Create your account',
  emailLabel: 'Email',
  passwordLabel: 'Password',
  passwordHint: 'At least 8 characters, with a letter, a digit and a symbol.',
  submitLabel: 'Create account',
  switchToSignIn: 'I already have an account',
} as const;

const EMPTY_FORM: Credentials = { email: '', password: '' };

type SignUpScreenProps = NativeStackScreenProps<AuthStackParamList, typeof AUTH_ROUTES.SIGN_UP>;

export const SignUpScreen = ({ navigation }: SignUpScreenProps) => {
  const { signUp, isSubmitting } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<Credentials>({
    resolver: zodResolver(signUpSchema),
    defaultValues: EMPTY_FORM,
  });

  const submit = handleSubmit(async (credentials) => {
    setFormError(null);

    try {
      await signUp(credentials);
    } catch (error) {
      applyServerFieldErrors(error, setError);
      setFormError(copyForError(error));
    }
  });

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <Text className="mb-6 text-2xl font-semibold text-content">{COPY.title}</Text>

      <FormTextField
        control={control}
        label={COPY.emailLabel}
        name="email"
        type={FIELD_TYPES.EMAIL}
      />
      <FormTextField
        control={control}
        label={COPY.passwordLabel}
        name="password"
        type={FIELD_TYPES.PASSWORD}
      />
      <Text className="mb-4 text-sm text-content-muted">{COPY.passwordHint}</Text>

      {formError === null ? null : (
        <Text className="mb-4 rounded-lg bg-danger-surface p-3 text-sm text-danger">
          {formError}
        </Text>
      )}

      <SubmitButton isPending={isSubmitting} label={COPY.submitLabel} onPress={submit} />

      <Pressable
        className="mt-4 items-center"
        onPress={() => navigation.navigate(AUTH_ROUTES.SIGN_IN)}
      >
        <Text className="text-sm text-primary">{COPY.switchToSignIn}</Text>
      </Pressable>
    </View>
  );
};
