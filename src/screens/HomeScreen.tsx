import { Text, View } from 'react-native';

const COPY = {
  title: 'Signed-in area',
} as const;

export const HomeScreen = () => (
  <View className="flex-1 items-center justify-center bg-background">
    <Text className="text-2xl font-semibold text-content">{COPY.title}</Text>
  </View>
);
