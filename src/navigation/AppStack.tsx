import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { HomeScreen } from '@/screens/HomeScreen';

import { APP_ROUTES } from './constants';
import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

const SCREEN_TITLES = {
  [APP_ROUTES.HOME]: 'Home',
} as const;

/** Signed-in flow. Add your app's screens here. */
export const AppStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name={APP_ROUTES.HOME}
      component={HomeScreen}
      options={{ title: SCREEN_TITLES[APP_ROUTES.HOME] }}
    />
  </Stack.Navigator>
);
