import { TextInput, type TextInputProps } from './TextInput';

export const PASSWORD_VARIANTS = { CURRENT: 'current', NEW: 'new' } as const;

export type PasswordVariant = (typeof PASSWORD_VARIANTS)[keyof typeof PASSWORD_VARIANTS];

// `new-password`, not `current-password`: this is what makes the platform
// password manager offer to generate and store one instead of filling the
// old one back in.
const AUTO_COMPLETE_BY_VARIANT: Record<PasswordVariant, TextInputProps['autoComplete']> = {
  [PASSWORD_VARIANTS.CURRENT]: 'current-password',
  [PASSWORD_VARIANTS.NEW]: 'new-password',
};

interface PasswordInputProps
  extends Omit<
    TextInputProps,
    'autoCapitalize' | 'autoComplete' | 'autoCorrect' | 'keyboardType' | 'secureTextEntry'
  > {
  variant?: PasswordVariant;
}

export const PasswordInput = ({
  variant = PASSWORD_VARIANTS.CURRENT,
  ...props
}: PasswordInputProps) => (
  <TextInput
    {...props}
    autoCapitalize="none"
    autoComplete={AUTO_COMPLETE_BY_VARIANT[variant]}
    autoCorrect={false}
    keyboardType="default"
    secureTextEntry={true}
  />
);
