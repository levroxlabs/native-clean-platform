import { TextInput, type TextInputProps } from './TextInput';

type EmailInputProps = Omit<
  TextInputProps,
  'autoCapitalize' | 'autoComplete' | 'autoCorrect' | 'keyboardType' | 'secureTextEntry'
>;

export const EmailInput = (props: EmailInputProps) => (
  <TextInput
    {...props}
    autoCapitalize="none"
    autoComplete="email"
    autoCorrect={false}
    keyboardType="email-address"
    secureTextEntry={false}
  />
);
