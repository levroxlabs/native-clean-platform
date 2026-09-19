import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { FormErrorMessage, FormField, SubmitButton } from '@/components';
import { copyForError } from '@/errors';
import { applyServerFieldErrors } from '../errorCopy';
import { useAuth } from '../hooks/useAuth';
import { type DeleteAccountValues, deleteAccountSchema } from '../validations';

const COPY = {
  title: 'Delete your account',
  // What the API actually does: no grace period and no export, which is why the
  // password is the only confirmation this screen asks for.
  warning:
    'This is permanent. Your account and everything tied to it are erased right away, with no grace period and nothing exported first.',
  passwordLabel: 'Password',
  submitLabel: 'Delete account',
} as const;

/** Checked against `DeleteAccountValues` by `Path<T>`. */
const FIELDS = ['password'] as const;

const EMPTY_FORM: DeleteAccountValues = { password: '' };

export const DeleteAccountScreen = () => {
  const { deleteAccount, isSubmitting } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<DeleteAccountValues>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: EMPTY_FORM,
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await deleteAccount(values);
      // No navigation: the session is gone, so `status` flips to signed out and
      // the root navigator swaps this whole stack for the sign-in flow.
    } catch (error) {
      applyServerFieldErrors(error, setError, FIELDS);
      setFormError(copyForError(error));
    }
  });

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <Text className="mb-1 text-2xl font-semibold text-content">{COPY.title}</Text>
      <Text className="mb-6 text-sm text-content-muted">{COPY.warning}</Text>

      <FormField control={control} label={COPY.passwordLabel} name="password" type="password" />

      <FormErrorMessage message={formError} />

      <SubmitButton isPending={isSubmitting} label={COPY.submitLabel} onPress={submit} />
    </View>
  );
};
