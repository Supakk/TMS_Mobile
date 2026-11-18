import { useNetworkState } from 'expo-network';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { TripSummary } from '../../../src/api/trips';
import { useSession } from '../../../src/auth/session';
import { formatDateTime } from '../../../src/dates';
import { t } from '../../../src/i18n';
import { useSettings } from '../../../src/settings/settings';
import { useSync } from '../../../src/hooks/useTrips';
import { colors, spacing } from '../../../src/theme';
import { Button, Card, StatusBadge, Screen } from '../../../src/ui';
import { SyncNotice } from '../../../src/components/SyncNotice';

function TripCard({ trip }: { trip: TripSummary }) {
  const router = useRouter();
  const { era } = useSettings();
  return (
    <Card onPress={() => router.push({ pathname: '/trips/[tripId]', params: { tripId: trip.id } })}>
      <View style={styles.cardTop}>
        <Text style={styles.tripNumber}>{trip.tripNumber}</Text>
        <StatusBadge status={trip.status} />
      </View>
      <Text style={styles.tripName}>{trip.name}</Text>
      <Text style={styles.meta}>
        {t('stopsProgress', { done: trip.completedStopCount, total: trip.stopCount })}
        {trip.vehicleCode ? `  ·  ${t('vehicle')} ${trip.vehicleCode}` : ''}
      </Text>
      <Text style={styles.meta}>
        {t('scheduledStart')}: {formatDateTime(trip.scheduledStartAt, era)}
      </Text>
      {!trip.acknowledged && trip.status !== 'IN_TRANSIT' ? (
        <Text style={styles.attention}>{t('notAcknowledged')}</Text>
      ) : null}
    </Card>
  );
}

export default function HomeScreen() {
  const { session } = useSession();
  const network = useNetworkState();
  const { trips, isLoading, isRefetching, isError, refetch, fromCache } = useSync();
  const offline = network.isInternetReachable === false || fromCache;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t('homeTitle')}</Text>
        <Text style={styles.hint}>
          {t('welcome')} {session?.account.displayName}
        </Text>
      </View>
      <View style={styles.pad}>
        <SyncNotice offline={offline} />
      </View>
      <FlatList
        data={trips}
        keyExtractor={(trip) => trip.id}
        renderItem={({ item }) => <TripCard trip={item} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={() => void refetch()} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            {isLoading ? null : <Text style={styles.hint}>{t('homeEmpty')}</Text>}
            {isError ? <Button title={t('retry')} variant="secondary" onPress={() => void refetch()} /> : null}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs },
  pad: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  title: { color: colors.text, fontSize: 30, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 16 },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  empty: { paddingTop: spacing.xl, gap: spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tripNumber: { color: colors.text, fontSize: 18, fontWeight: '700' },
  tripName: { color: colors.text, fontSize: 16 },
  meta: { color: colors.muted, fontSize: 15 },
  attention: { color: colors.accent, fontSize: 15, fontWeight: '700' },
});
