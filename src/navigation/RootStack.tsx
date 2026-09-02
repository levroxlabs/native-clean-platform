import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AUTH_STATUSES, AuthStack, useAuth } from '@/modules/auth';

import { AppStack } from './AppStack';
import { ROOT_ROUTES } from './constants';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const SCREEN_OPTIONS = { headerShown: false } as const;

/**
 * One `Stack.Screen` per module, never per screen — a module's internals stop
 * at its own navigator.
 *
 * Only one side is rendered, rather than registering both and calling
 * `navigate`: that is what leaves no history for the Android back button to
 * walk into a signed-in screen after sign-out.
 */
export const RootStack = () => {
  const { status } = useAuth();

  return (
    <Stack.Navigator screenOptions={SCREEN_OPTIONS}>
      {status === AUTH_STATUSES.SIGNED_IN ? (
        <Stack.Screen name={ROOT_ROUTES.APP} component={AppStack} />
      ) : (
        <Stack.Screen name={ROOT_ROUTES.AUTH} component={AuthStack} />
      )}
    </Stack.Navigator>
  );
};
