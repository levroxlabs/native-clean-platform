import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, Pressable, Text, View } from 'react-native';

import { useErrorToast } from '@/errors';

import { useAuth } from '../hooks/useAuth';
import type { AccountStackParamList } from '../navigation/types';

const COPY = {
  emailLabel: 'Signed in as',
  changePasswordLabel: 'Change password',
  signOutLabel: 'Sign out',
  signOutEverywhereLabel: 'Sign out everywhere',
  confirmTitle: 'Sign out everywhere?',
  confirmMessage: 'Every device signed in to this account will be signed out.',
  confirmLabel: 'Sign out',
  cancelLabel: 'Cancel',
} as const;

type AccountScreenProps = NativeStackScreenProps<AccountStackParamList, 'Account'>;

/**
 * Renders the address and the actions, and nothing dated. `/auth/me` also
 * returns `createdAt` and `emailVerifiedAt`, and rendering either would need a
 * formatter, a locale decision and a `Date` whose only consumer is its own
 * formatting.
 */
export const AccountScreen = ({ navigation }: AccountScreenProps) => {
  const { user, signOut, signOutEverywhere, isSigningOut } = useAuth();
  const { showError } = useErrorToast();

  const confirmSignOutEverywhere = () => {
    Alert.alert(COPY.confirmTitle, COPY.confirmMessage, [
      { text: COPY.cancelLabel, style: 'cancel' },
      {
        text: COPY.confirmLabel,
        style: 'destructive',
        onPress: () => {
          // This one rejects on failure and keeps the session, so the rejection
          // has to reach the toast instead of going unhandled.
          void signOutEverywhere().catch(showError);
        },
      },
    ]);
  };

  return (
    <View className="flex-1 gap-4 bg-background px-6 py-8">
      <View>
        <Text className="text-sm text-content-muted">{COPY.emailLabel}</Text>
        <Text className="text-lg font-semibold text-content">{user?.email ?? ''}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        className="w-full items-center rounded-lg bg-primary px-4 py-3 active:bg-primary-pressed"
        onPress={() => navigation.navigate('ChangePassword')}
      >
        <Text className="text-base font-semibold text-content-inverse">
          {COPY.changePasswordLabel}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isSigningOut }}
        className="w-full items-center rounded-lg border border-border px-4 py-3"
        disabled={isSigningOut}
        onPress={() => {
          // Cannot reject by construction: it swallows the server call's failure.
          void signOut();
        }}
      >
        <Text className="text-base font-semibold text-content">{COPY.signOutLabel}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isSigningOut }}
        className="w-full items-center rounded-lg border border-danger px-4 py-3"
        disabled={isSigningOut}
        onPress={confirmSignOutEverywhere}
      >
        <Text className="text-base font-semibold text-danger">{COPY.signOutEverywhereLabel}</Text>
      </Pressable>
    </View>
  );
};
