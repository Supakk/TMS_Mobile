import { Ionicons } from '@expo/vector-icons';
import { useNetworkState } from 'expo-network';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { TripSummary } from '../../../src/api/trips';
import { useSession } from '../../../src/auth/session';
import { formatDateRange } from '../../../src/dates';
import { tripBucket, type TripBucket } from '../../../src/domain/trip';
import { t } from '../../../src/i18n';
import { useSettings } from '../../../src/settings/settings';
import { useSync } from '../../../src/hooks/useTrips';
import { colors, radius, spacing } from '../../../src/theme';
import { Button, Hero, Screen, Segmented, Skeleton, StatusBadge, ViewPill, rise, settle } from '../../../src/ui';
import { SyncNotice } from '../../../src/components/SyncNotice';

type Tab = Exclude<TripBucket, 'PENDING'>;

const open = (router: ReturnType<typeof useRouter>, trip: TripSummary) =>
  router.push({ pathname: '/trips/[tripId]', params: { tripId: trip.id } });

/** A trip that waits for the driver's answer: the gradient block at the top of the page. */
const PendingBanner = memo(function PendingBanner({ trip, index }: { trip: TripSummary; index: number }) {
  const router = useRouter();
  const { era } = useSettings();
  return (
    <Animated.View entering={rise(index)} layout={settle}>
    <Hero>
      <View style={styles.heroKickerRow}>
        <Ionicons name="alert-circle-outline" size={20} color={colors.onHero} />
        <Text style={styles.heroKicker}>{t('newTripPending')}</Text>
      </View>
      <Text style={styles.heroTitle}>{trip.name}</Text>
      <View style={styles.heroGap} />
      <Text style={styles.heroDate}>{formatDateRange(trip.scheduledStartAt, trip.estimatedArrivalAt, era)}</Text>
      <View style={styles.heroFoot}>
        <Text style={styles.heroNumber}>
          {t('tripNo')} {trip.tripNumber}
        </Text>
        <ViewPill label={t('view')} onPress={() => open(router, trip)} />
      </View>
    </Hero>
    </Animated.View>
  );
});

// Memoised: a list redraw (a new minute's refresh, a banner appearing) leaves rows whose trip did not change alone.
const TripRow = memo(function TripRow({ trip }: { trip: TripSummary }) {
  const router = useRouter();
  const { era } = useSettings();
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.iconCircle}>
          <Ionicons name="cube-outline" size={22} color={colors.accent} />
        </View>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {trip.name}
        </Text>
        {trip.status === 'CANCELLED' || trip.status === 'DELIVERED' ? <StatusBadge status={trip.status} /> : null}
      </View>
      <View style={styles.divider} />
      <Text style={styles.rowDate}>
        {formatDateRange(trip.scheduledStartAt, trip.estimatedArrivalAt, era)}
        {'  ·  '}
        {t('stopsProgress', { done: trip.completedStopCount, total: trip.stopCount })}
      </Text>
      <View style={styles.rowFoot}>
        <Text style={styles.rowNumber}>
          {t('tripNo')} {trip.tripNumber}
        </Text>
        <ViewPill label={t('view')} onPress={() => open(router, trip)} />
      </View>
    </View>
  );
});

export default function HomeScreen() {
  const { session } = useSession();
  const network = useNetworkState();
  const { trips, isLoading, isRefetching, isError, refetch, fromCache } = useSync();
  const offline = network.isInternetReachable === false || fromCache;
  const [picked, setPicked] = useState<Tab | null>(null);

  const { pending, lists } = useMemo(() => {
    const by = (b: TripBucket) => trips.filter((trip) => tripBucket(trip.status, trip.acknowledged) === b);
    return {
      pending: by('PENDING'),
      lists: { ACCEPTED: by('ACCEPTED'), IN_TRANSIT: by('IN_TRANSIT'), DONE: by('DONE') } as Record<Tab, TripSummary[]>,
    };
  }, [trips]);

  // Start on the first list that has something, so the driver is not shown an empty tab first.
  const tab: Tab = picked ?? (['IN_TRANSIT', 'ACCEPTED', 'DONE'] as Tab[]).find((b) => lists[b].length > 0) ?? 'ACCEPTED';
  const shown = lists[tab];
  const countKey = tab === 'ACCEPTED' ? 'countAccepted' : tab === 'IN_TRANSIT' ? 'countInTransit' : 'countDone';

  const renderItem = useCallback(({ item, index }: { item: TripSummary; index: number }) => (
    <Animated.View entering={rise(index)} layout={settle} style={styles.rowWrap}>
      <TripRow trip={item} />
    </Animated.View>
  ), []);
  const keyExtractor = useCallback((trip: TripSummary) => trip.id, []);
  const onRefresh = useCallback(() => void refetch(), [refetch]);

  const header = (
    <>
      {/* Top zone: the page colour, with the title and the loads that need an answer. */}
      <View style={styles.top}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('homeTitle')}</Text>
          <Text style={styles.driver} numberOfLines={1}>
            {session?.account.displayName}
          </Text>
        </View>
        <SyncNotice offline={offline} />
        {pending.map((trip, index) => (
          <PendingBanner key={trip.id} trip={trip} index={index} />
        ))}
      </View>
      {/* Bottom zone starts here: a white sheet with the lists. */}
      <View style={styles.sheetHead}>
        <Segmented<Tab>
          value={tab}
          onChange={setPicked}
          options={[
            { value: 'ACCEPTED', label: t('tabAccepted') },
            { value: 'IN_TRANSIT', label: t('tabInTransit') },
            { value: 'DONE', label: t('tabDelivered') },
          ]}
        />
        <Text style={styles.count}>{t(countKey, { n: shown.length })}</Text>
      </View>
    </>
  );

  return (
    <Screen>
      <FlatList
        data={shown}
        extraData={tab}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}>
              <Skeleton height={150} />
              <Skeleton height={150} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.hint}>{trips.length === 0 ? t('homeEmpty') : t('emptyBucket')}</Text>
              {isError ? <Button title={t('retry')} variant="secondary" onPress={onRefresh} /> : null}
            </View>
          )
        }
        // The white sheet runs to the bottom of the screen even when the list is short.
        ListFooterComponent={<View style={styles.sheetEnd} />}
        ListFooterComponentStyle={styles.sheetFill}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={onRefresh} />}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  top: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  driver: { color: colors.muted, fontSize: 14, flexShrink: 1 },

  sheetHead: { backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: 0, gap: spacing.md },
  rowWrap: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  empty: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  sheetFill: { flex: 1, backgroundColor: colors.surface },
  sheetEnd: { minHeight: spacing.lg },
  count: { color: colors.muted, fontSize: 15 },
  hint: { color: colors.muted, fontSize: 16 },

  heroKickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroKicker: { color: colors.onHeroMuted, fontSize: 15 },
  heroTitle: { color: colors.onHero, fontSize: 18, fontWeight: '700', marginTop: 2 },
  heroGap: { height: spacing.md },
  heroDate: { color: colors.onHeroMuted, fontSize: 13 },
  heroFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroNumber: { color: colors.onHero, fontSize: 18 },

  row: { backgroundColor: colors.cardMuted, borderRadius: radius.card - 6, padding: spacing.md, gap: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '600' },
  rowDate: { color: colors.muted, fontSize: 13 },
  rowNumber: { color: colors.text, fontSize: 16 },
  rowFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: colors.hairline },
});
