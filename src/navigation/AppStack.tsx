import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AccountStack } from '@/modules/auth';
import { HomeScreen } from '@/screens/HomeScreen';

import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

/** User-facing, so it is copy — the route name it belongs to is not. */
const SCREEN_TITLES = {
  home: 'Home',
} as const;

/** The inner stack owns its own header; nesting two would show two. */
const ACCOUNT_OPTIONS = { headerShown: false } as const;

/** Signed-in flow. Add your app's screens here. */
export const AppStack = () => (
  <Stack.Navigator>
    <Stack.Screen name="Home" component={HomeScreen} options={{ title: SCREEN_TITLES.home }} />
    <Stack.Screen name="Account" component={AccountStack} options={ACCOUNT_OPTIONS} />
  </Stack.Navigator>
);
