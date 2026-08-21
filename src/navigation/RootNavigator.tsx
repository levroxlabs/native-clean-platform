import { NavigationContainer } from '@react-navigation/native';

import { AppStack } from './AppStack';

export const RootNavigator = () => (
  <NavigationContainer>
    <AppStack />
  </NavigationContainer>
);
