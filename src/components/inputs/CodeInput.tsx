import { TextInput, type TextInputProps } from './TextInput';

interface CodeInputProps
  extends Omit<
    TextInputProps,
    | 'autoCapitalize'
    | 'autoComplete'
    | 'autoCorrect'
    | 'keyboardType'
    | 'maxLength'
    | 'secureTextEntry'
  > {
  digits: number;
}

export const CodeInput = ({ digits, ...props }: CodeInputProps) => (
  <TextInput
    {...props}
    autoCapitalize="none"
    autoComplete="one-time-code"
    autoCorrect={false}
    keyboardType="number-pad"
    // The code has exactly this many digits, so the keyboard stops accepting
    // a seventh rather than letting the user find out at submit.
    maxLength={digits}
    secureTextEntry={false}
  />
);
