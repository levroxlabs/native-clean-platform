import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SignInScreen } from '../screens/SignInScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { AUTH_ROUTES } from './constants';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

const SCREEN_OPTIONS = { headerShown: false } as const;

/** The signed-out flow. Everything it needs lives inside this module. */
export const AuthStack = () => (
  <Stack.Navigator screenOptions={SCREEN_OPTIONS}>
    <Stack.Screen name={AUTH_ROUTES.SIGN_IN} component={SignInScreen} />
    <Stack.Screen name={AUTH_ROUTES.SIGN_UP} component={SignUpScreen} />
  </Stack.Navigator>
);
