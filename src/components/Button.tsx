import { ActivityIndicator, Pressable, type PressableProps, Text } from 'react-native';

import { cn } from '@/utils';

export const BUTTON_VARIANTS = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
  GHOST: 'ghost',
} as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[keyof typeof BUTTON_VARIANTS];

type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: ButtonVariant;
  isLoading?: boolean;
  className?: string;
};

const CONTAINER_CLASSES: Record<ButtonVariant, string> = {
  [BUTTON_VARIANTS.PRIMARY]: 'bg-primary active:bg-primary-pressed',
  [BUTTON_VARIANTS.SECONDARY]: 'bg-surface-muted active:bg-border',
  [BUTTON_VARIANTS.GHOST]: 'bg-transparent active:bg-surface-muted',
};

const LABEL_CLASSES: Record<ButtonVariant, string> = {
  [BUTTON_VARIANTS.PRIMARY]: 'text-content-inverse',
  [BUTTON_VARIANTS.SECONDARY]: 'text-content',
  [BUTTON_VARIANTS.GHOST]: 'text-primary',
};

const ACCESSIBILITY_ROLE = 'button';

export const Button = ({
  label,
  variant = BUTTON_VARIANTS.PRIMARY,
  isLoading = false,
  disabled,
  className,
  ...props
}: ButtonProps) => {
  const isDisabled = disabled || isLoading;

  return (
    <Pressable
      accessibilityRole={ACCESSIBILITY_ROLE}
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      disabled={isDisabled}
      className={cn(
        'h-12 flex-row items-center justify-center rounded-lg px-5',
        CONTAINER_CLASSES[variant],
        isDisabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator />
      ) : (
        <Text className={cn('text-base font-semibold', LABEL_CLASSES[variant])}>{label}</Text>
      )}
    </Pressable>
  );
};
