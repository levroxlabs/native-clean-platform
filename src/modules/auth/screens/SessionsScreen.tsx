import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import type { ActiveSession } from '../api/schemas';
import { useSessions } from '../hooks/useSessions';
import { formatSessionDate } from '../utils/formatSessionDate';

const COPY = {
  startedLabel: 'Started',
  unknownDevice: 'Unknown device',
  unknownAddress: 'Unknown address',
  errorMessage: 'Could not load your sessions.',
  retryLabel: 'Try again',
} as const;

const renderSession = ({ item }: { item: ActiveSession }) => (
  <View className="gap-1 border-b border-border px-6 py-4">
    <Text className="text-base font-semibold text-content">
      {item.deviceLabel ?? COPY.unknownDevice}
    </Text>
    <Text className="text-sm text-content-muted">{item.ip ?? COPY.unknownAddress}</Text>
    <Text className="text-sm text-content-muted">
      {`${COPY.startedLabel} ${formatSessionDate(item.startedAt)}`}
    </Text>
  </View>
);

const extractSessionId = (session: ActiveSession) => session.id;

/**
 * Read-only on purpose: the API has no endpoint to end one session or to tell
 * which one is the caller's, so "Sign out everywhere" on `Account` is the only
 * action the list could offer.
 */
export const SessionsScreen = () => {
  const { data, isPending, isError, isRefetching, refetch } = useSessions();

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessible accessibilityRole="progressbar" />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
        <Text className="text-base text-content-muted">{COPY.errorMessage}</Text>
        <Pressable
          accessibilityRole="button"
          className="items-center rounded-lg bg-primary px-4 py-3 active:bg-primary-pressed"
          onPress={() => refetch()}
        >
          <Text className="text-base font-semibold text-content-inverse">{COPY.retryLabel}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background"
      data={data}
      keyExtractor={extractSessionId}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
      renderItem={renderSession}
    />
  );
};
