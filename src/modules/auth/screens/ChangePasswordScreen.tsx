import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { copyForError } from '@/errors';

import { FIELD_TYPES, FormTextField } from '../components/FormTextField';
import { SubmitButton } from '../components/SubmitButton';
import { applyServerFieldErrors } from '../errorCopy';
import { useAuth } from '../hooks/useAuth';
import type { AccountStackParamList } from '../navigation/types';
import { type ChangePasswordValues, changePasswordSchema } from '../validations';

const COPY = {
  title: 'Change your password',
  // The honest description of what the API does, and what makes `goBack()` on
  // success enough: nothing surprising happened to this device.
  subtitle: 'Every other device will be signed out. This one stays signed in.',
  currentPasswordLabel: 'Current password',
  newPasswordLabel: 'New password',
  confirmPasswordLabel: 'Confirm password',
  passwordHint: 'At least 8 characters, with a letter, a digit and a symbol.',
  submitLabel: 'Change password',
} as const;

/**
 * Checked against `ChangePasswordValues` by `Path<T>`. `confirmPassword` is
 * absent: the API has no such field, so it can never appear in `details[]`.
 */
const FIELDS = ['currentPassword', 'newPassword'] as const;

const EMPTY_FORM: ChangePasswordValues = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

type ChangePasswordScreenProps = NativeStackScreenProps<AccountStackParamList, 'ChangePassword'>;

export const ChangePasswordScreen = ({ navigation }: ChangePasswordScreenProps) => {
  const { changePassword, isSubmitting } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: EMPTY_FORM,
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await changePassword(values);
      // The session survives — the context adopted the pair the API handed
      // back — so there is nowhere to send the user but back where they were.
      navigation.goBack();
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
        label={COPY.currentPasswordLabel}
        name="currentPassword"
        type={FIELD_TYPES.PASSWORD}
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

      <SubmitButton isPending={isSubmitting} label={COPY.submitLabel} onPress={submit} />
    </View>
  );
};
