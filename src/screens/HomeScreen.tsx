import { Text } from 'react-native';

import { Screen } from '@/components';

const COPY = {
  title: 'Signed-in area',
  subtitle: 'This screen proves navigation, NativeWind and the design tokens work end to end.',
} as const;

/** Placeholder for the app's first screen. Replace it with real content. */
export const HomeScreen = () => (
  <Screen className="justify-center">
    <Text className="text-2xl font-semibold text-content">{COPY.title}</Text>
    <Text className="mt-2 text-base text-content-muted">{COPY.subtitle}</Text>
  </Screen>
);
