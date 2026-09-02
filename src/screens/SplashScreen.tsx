import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/theme';

/** Shown only during boot, while the stored token is being verified. */
export const SplashScreen = () => (
  <View className="flex-1 items-center justify-center bg-background">
    <ActivityIndicator color={colors.brand[500]} />
  </View>
);
