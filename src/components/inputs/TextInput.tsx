import {
  TextInput as NativeTextInput,
  type TextInputProps as NativeTextInputProps,
  Text,
  View,
} from 'react-native';

import { classnames } from '@/utils';

export interface TextInputProps extends Omit<NativeTextInputProps, 'value' | 'onChangeText'> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
}

export const TextInput = ({
  label,
  value,
  onChangeText,
  error,
  className,
  ...inputProps
}: TextInputProps) => (
  <View className="mb-4">
    <Text className="mb-1 text-sm font-medium text-content">{label}</Text>
    <NativeTextInput
      accessibilityLabel={label}
      className={classnames(
        'rounded-lg border border-border bg-surface px-3 py-3 text-base text-content',
        className,
      )}
      onChangeText={onChangeText}
      value={value}
      {...inputProps}
    />
    {error === undefined ? null : <Text className="mt-1 text-sm text-danger">{error}</Text>}
  </View>
);
