import { type Control, Controller, type FieldValues, type Path } from 'react-hook-form';
import { Text, TextInput, View } from 'react-native';

export const FIELD_TYPES = {
  EMAIL: 'email',
  PASSWORD: 'password',
} as const;

export type FieldType = (typeof FIELD_TYPES)[keyof typeof FIELD_TYPES];

/** Keyboard behaviour belongs to the kind of field, not to each call site. */
const INPUT_PROPS_BY_TYPE = {
  [FIELD_TYPES.EMAIL]: {
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    autoComplete: 'email',
    secureTextEntry: false,
  },
  [FIELD_TYPES.PASSWORD]: {
    keyboardType: 'default',
    autoCapitalize: 'none',
    autoComplete: 'current-password',
    secureTextEntry: true,
  },
} as const;

interface FormTextFieldProps<TValues extends FieldValues> {
  control: Control<TValues>;
  name: Path<TValues>;
  label: string;
  type: FieldType;
}

export const FormTextField = <TValues extends FieldValues>({
  control,
  name,
  label,
  type,
}: FormTextFieldProps<TValues>) => (
  <Controller
    control={control}
    name={name}
    render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => (
      <View className="mb-4">
        <Text className="mb-1 text-sm font-medium text-content">{label}</Text>
        <TextInput
          accessibilityLabel={label}
          className="rounded-lg border border-border bg-surface px-3 py-3 text-base text-content"
          onBlur={onBlur}
          onChangeText={onChange}
          value={value ?? ''}
          {...INPUT_PROPS_BY_TYPE[type]}
        />
        {error?.message === undefined ? null : (
          <Text className="mt-1 text-sm text-danger">{error.message}</Text>
        )}
      </View>
    )}
  />
);
