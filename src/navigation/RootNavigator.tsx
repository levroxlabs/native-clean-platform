import { NavigationContainer } from '@react-navigation/native';

import { AUTH_STATUSES, useAuth } from '@/modules/auth';
import { SplashScreen } from '@/screens';

import { RootStack } from './RootStack';

/**
 * The container is mounted only once the session is known. Rendering it during
 * boot would mean mounting a navigator whose first screen we would immediately
 * have to replace.
 */
export const RootNavigator = () => {
  const { status } = useAuth();

  if (status === AUTH_STATUSES.LOADING) return <SplashScreen />;

  return (
    <NavigationContainer>
      <RootStack />
    </NavigationContainer>
  );
};
