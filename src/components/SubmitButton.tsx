import { ActivityIndicator, Pressable, Text } from 'react-native';

import { colors } from '@/theme';

interface SubmitButtonProps {
  label: string;
  isPending: boolean;
  onPress: () => void;
}

export const SubmitButton = ({ label, isPending, onPress }: SubmitButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled: isPending }}
    className="items-center rounded-lg bg-primary px-4 py-3 active:bg-primary-pressed"
    disabled={isPending}
    onPress={onPress}
  >
    {isPending ? (
      <ActivityIndicator color={colors.neutral[0]} />
    ) : (
      <Text className="text-base font-semibold text-content-inverse">{label}</Text>
    )}
  </Pressable>
);
