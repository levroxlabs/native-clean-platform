import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AccountScreen } from '../screens/AccountScreen';
import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';
import { DeleteAccountScreen } from '../screens/DeleteAccountScreen';
import { SessionsScreen } from '../screens/SessionsScreen';
import type { AccountStackParamList } from './types';

const Stack = createNativeStackNavigator<AccountStackParamList>();

/** User-facing, so it is copy — the route name it belongs to is not. */
const SCREEN_TITLES = {
  account: 'Account',
  changePassword: 'Change password',
  sessions: 'Active sessions',
  deleteAccount: 'Delete account',
} as const;

/**
 * The account area, inside the signed-in shell. Unlike `AuthStack` this one
 * shows its header: it is a pushed flow, and the header is the way back.
 */
export const AccountStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="Account"
      component={AccountScreen}
      options={{ title: SCREEN_TITLES.account }}
    />
    <Stack.Screen
      name="ChangePassword"
      component={ChangePasswordScreen}
      options={{ title: SCREEN_TITLES.changePassword }}
    />
    <Stack.Screen
      name="Sessions"
      component={SessionsScreen}
      options={{ title: SCREEN_TITLES.sessions }}
    />
    <Stack.Screen
      name="DeleteAccount"
      component={DeleteAccountScreen}
      options={{ title: SCREEN_TITLES.deleteAccount }}
    />
  </Stack.Navigator>
);
