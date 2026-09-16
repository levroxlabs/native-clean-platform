import { type Control, Controller, type FieldValues, type Path } from 'react-hook-form';

import { CodeInput } from '../inputs/CodeInput';
import { EmailInput } from '../inputs/EmailInput';
import { PASSWORD_VARIANTS, PasswordInput } from '../inputs/PasswordInput';
import { TextInput } from '../inputs/TextInput';

export const FORM_FIELD_TYPES = {
  TEXT: 'text',
  EMAIL: 'email',
  PASSWORD: 'password',
  NEW_PASSWORD: 'newPassword',
  CODE: 'code',
} as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[keyof typeof FORM_FIELD_TYPES];

const MISSING_DIGITS_MESSAGE = 'FormField requires `digits` when type is "code".';

interface FormFieldProps<TValues extends FieldValues> {
  control: Control<TValues>;
  name: Path<TValues>;
  label: string;
  type: FormFieldType;
  digits?: number;
  inputProps?: Record<string, unknown>;
}

export const FormField = <TValues extends FieldValues>({
  control,
  name,
  label,
  type,
  digits,
  inputProps,
}: FormFieldProps<TValues>) => (
  <Controller
    control={control}
    name={name}
    render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => {
      const commonProps = {
        label,
        value: value ?? '',
        onChangeText: onChange,
        onBlur,
        error: error?.message,
        ...inputProps,
      };

      switch (type) {
        case FORM_FIELD_TYPES.EMAIL:
          return <EmailInput {...commonProps} />;
        case FORM_FIELD_TYPES.PASSWORD:
          return <PasswordInput {...commonProps} variant={PASSWORD_VARIANTS.CURRENT} />;
        case FORM_FIELD_TYPES.NEW_PASSWORD:
          return <PasswordInput {...commonProps} variant={PASSWORD_VARIANTS.NEW} />;
        case FORM_FIELD_TYPES.CODE:
          if (digits === undefined) {
            throw new Error(MISSING_DIGITS_MESSAGE);
          }

          return <CodeInput {...commonProps} digits={digits} />;
        case FORM_FIELD_TYPES.TEXT:
          return <TextInput {...commonProps} />;
      }
    }}
  />
);
