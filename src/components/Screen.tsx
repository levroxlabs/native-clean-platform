import type { ReactNode } from 'react';
import { View } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { cn } from '@/utils';

/** Insets a screen respects by default. Sides are left alone so backgrounds bleed edge to edge. */
const DEFAULT_SAFE_AREA_EDGES: readonly Edge[] = ['top', 'bottom'];

type ScreenProps = {
  children: ReactNode;
  /** Classes applied to the inner container (padding, alignment, and so on). */
  className?: string;
  /** Which edges respect the safe area. Defaults to top and bottom. */
  edges?: readonly Edge[];
};

/** Default screen container: safe area plus the themed background colour. */
export const Screen = ({ children, className, edges = DEFAULT_SAFE_AREA_EDGES }: ScreenProps) => (
  <SafeAreaView className="flex-1 bg-background" edges={edges}>
    <View className={cn('flex-1 px-6', className)}>{children}</View>
  </SafeAreaView>
);
