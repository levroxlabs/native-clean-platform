import { type Control, Controller, type FieldValues, type Path } from 'react-hook-form';
import { Text, TextInput, View } from 'react-native';

import { VERIFICATION_CODE_DIGITS } from '../validations';

export const FIELD_TYPES = {
  EMAIL: 'email',
  PASSWORD: 'password',
  NEW_PASSWORD: 'newPassword',
  CODE: 'code',
  TOKEN: 'token',
} as const;

export type FieldType = (typeof FIELD_TYPES)[keyof typeof FIELD_TYPES];

/**
 * Keyboard behaviour belongs to the kind of field, not to each call site.
 *
 * Every entry declares every key, `undefined` included: a partial record would
 * make the props a field receives depend on which branch produced them.
 */
const INPUT_PROPS_BY_TYPE = {
  [FIELD_TYPES.EMAIL]: {
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    autoComplete: 'email',
    autoCorrect: false,
    secureTextEntry: false,
    maxLength: undefined,
  },
  [FIELD_TYPES.PASSWORD]: {
    keyboardType: 'default',
    autoCapitalize: 'none',
    autoComplete: 'current-password',
    autoCorrect: false,
    secureTextEntry: true,
    maxLength: undefined,
  },
  [FIELD_TYPES.NEW_PASSWORD]: {
    keyboardType: 'default',
    autoCapitalize: 'none',
    // `new-password`, not `current-password`: this is what makes the platform
    // password manager offer to generate and store one instead of filling the
    // old one back in.
    autoComplete: 'new-password',
    autoCorrect: false,
    secureTextEntry: true,
    maxLength: undefined,
  },
  [FIELD_TYPES.CODE]: {
    keyboardType: 'number-pad',
    autoCapitalize: 'none',
    autoComplete: 'one-time-code',
    autoCorrect: false,
    secureTextEntry: false,
    // The code has exactly this many digits, so the keyboard stops accepting a
    // seventh rather than letting the user find out at submit.
    maxLength: VERIFICATION_CODE_DIGITS,
  },
  [FIELD_TYPES.TOKEN]: {
    keyboardType: 'default',
    // A pasted base64url string meets autocapitalisation and autocorrect turned
    // on by default, and either one silently produces a token the API rejects
    // with the same generic error it gives one that never existed.
    autoCapitalize: 'none',
    autoComplete: 'off',
    autoCorrect: false,
    secureTextEntry: false,
    maxLength: undefined,
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
