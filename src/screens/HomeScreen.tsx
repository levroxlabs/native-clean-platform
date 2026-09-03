import { Alert, Pressable, Text, View } from 'react-native';

import { useErrorToast } from '@/errors';
import { useAuth } from '@/modules/auth';

const COPY = {
  title: 'Signed-in area',
  signOutLabel: 'Sign out',
  signOutEverywhereLabel: 'Sign out everywhere',
  confirmTitle: 'Sign out everywhere?',
  confirmMessage: 'Every device signed in to this account will be signed out.',
  confirmLabel: 'Sign out',
  cancelLabel: 'Cancel',
} as const;

export const HomeScreen = () => {
  const { signOut, signOutEverywhere, isSigningOut } = useAuth();
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
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text className="text-2xl font-semibold text-content">{COPY.title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isSigningOut }}
        className="w-full items-center rounded-lg bg-primary px-4 py-3 active:bg-primary-pressed"
        disabled={isSigningOut}
        onPress={() => {
          // Cannot reject by construction: it swallows the server call's failure.
          void signOut();
        }}
      >
        <Text className="text-base font-semibold text-content-inverse">{COPY.signOutLabel}</Text>
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
