import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '../../../../src/components/RouteMap';
import { SyncNotice } from '../../../../src/components/SyncNotice';
import { formatDateRange, formatDateTime } from '../../../../src/dates';
import { canAcknowledge, currentStop, sortedStops, stopWord, tripStep, type Stop } from '../../../../src/domain/trip';
import { useAccountId, useSync, useTrip } from '../../../../src/hooks/useTrips';
import { t, tCode, type MessageKey } from '../../../../src/i18n';
import { useBackgroundPermission, useLocationPermission, useTripTracking } from '../../../../src/location/tracking';
import { offline } from '../../../../src/offline/manager';
import { useSettings } from '../../../../src/settings/settings';
import { colors, radius, spacing, statusTone, tones } from '../../../../src/theme';
import { Banner, Button, Card, Field, Hero, Screen, Skeleton, rise, settle } from '../../../../src/ui';

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Back arrow on the left, the trip's state as the title in the middle. Sits inside the top block, under the status bar. */
function TopBar({ title, onDark, onBack }: { title: string; onDark: boolean; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const ink = onDark ? colors.onHero : colors.text;
  return (
    <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={onBack} hitSlop={12} style={styles.backButton}>
        <Ionicons name="chevron-back" size={26} color={onDark ? colors.onHero : colors.accent} />
      </Pressable>
      <Text style={[styles.topTitle, { color: ink }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.backButton} />
    </View>
  );
}

/** One stop on the vertical timeline: a marker and line on the left, the stop as a white card on the right. */
function StopItem({
  stop,
  current,
  last,
  era,
  index,
  onPress,
}: {
  stop: Stop;
  index: number;
  current: boolean;
  last: boolean;
  era: 'BE' | 'CE';
  onPress: () => void;
}) {
  const left = stop.actualDepartureAt !== null;
  return (
    <Animated.View entering={rise(index)} layout={settle} style={styles.stopItem}>
      <View style={styles.rail}>
        {/* The marker pops when a stop is reached or left, so the change is seen, not just found. */}
        <Animated.View key={left ? 'left' : current ? 'here' : 'later'} entering={ZoomIn.duration(260)}>
          {left ? (
            <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
          ) : (
            <Ionicons name={current ? 'radio-button-on' : 'radio-button-off'} size={24} color={current ? colors.accent : colors.muted} />
          )}
        </Animated.View>
        {last ? null : <View style={[styles.line, left && { borderColor: colors.accent }]} />}
      </View>
      <View style={styles.stopBody}>
        <Text style={styles.stopKind}>{tCode('type', stop.stopType)}</Text>
        <Card onPress={onPress} style={current ? styles.currentStop : undefined}>
          <Text style={styles.stopTitle}>
            {stop.sequence}. {stop.name}
          </Text>
          <View style={styles.iconLine}>
            <Ionicons name="location-outline" size={20} color={colors.muted} />
            <Text style={[styles.meta, styles.grow]}>{stop.address}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </View>
          {stop.plannedArrivalAt ? (
            <>
              <View style={styles.divider} />
              <View style={styles.iconLine}>
                <Ionicons name="calendar-outline" size={20} color={colors.muted} />
                <Text style={styles.meta}>
                  {t('plannedAt')} {formatDateTime(stop.plannedArrivalAt, era)}
                </Text>
              </View>
            </>
          ) : null}
          <Text style={styles.stopWord}>{t(`stop${capitalize(stopWord(stop))}` as MessageKey)}</Text>
        </Card>
      </View>
    </Animated.View>
  );
}

export default function TripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const accountId = useAccountId();
  const { era } = useSettings();
  const trip = useTrip(tripId);
  const sync = useSync();
  const location = useLocationPermission();
  const background = useBackgroundPermission();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const data = trip.data;
  const summary = sync.trips.find((x) => x.id === tripId);
  const acknowledged = summary?.acknowledged ?? true;
  const step = data ? tripStep(data) : null;

  // Position is stored and shared only while the trip is on the road; behind other apps only if the driver allowed it.
  useTripTracking(accountId, tripId, data?.status === 'IN_TRANSIT' && location.state === 'granted', background.granted);

  // Every step below is saved on the phone first and sent when there is a connection.
  const answer = (accepted: boolean) => {
    void offline.enqueue(tripId, { kind: 'ACK', accepted, reason: accepted ? null : reason.trim() });
    setRejecting(false);
  };

  const confirm = (title: string, run: () => void) =>
    Alert.alert(title, undefined, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('confirm'), onPress: run },
    ]);

  // This screen draws its own header (it sits inside the coloured block), so the navigator's is hidden.
  const noHeader = <Stack.Screen options={{ headerShown: false }} />;

  if (trip.isLoading) {
    return (
      <Screen edges={[]}>
        {noHeader}
        <TopBar title="" onDark={false} onBack={() => router.back()} />
        <View style={styles.content}>
          <Skeleton height={34} style={{ width: '70%' }} />
          <Skeleton height={48} />
          <Skeleton height={190} />
          <Skeleton height={140} />
        </View>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen edges={[]}>
        {noHeader}
        <TopBar title="" onDark={false} onBack={() => router.back()} />
        <View style={styles.content}>
          <Banner message={trip.isError ? t('offlineSaved') : t('tripNotFound')} />
          <Button title={t('back')} variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const next = currentStop(data);
  const awaiting = canAcknowledge(data, acknowledged);
  const statusText = awaiting ? t('statusPending') : tCode('status', data.status);
  const tone = tones[statusTone[data.status] ?? 'neutral'];
  const ink = awaiting ? colors.onHero : colors.text;
  const soft = awaiting ? colors.onHeroMuted : colors.muted;

  // The top block: the title bar, the route, the facts and the map. A load that needs an answer has it on the gradient.
  const block = (
    <>
      <TopBar title={statusText} onDark={awaiting} onBack={() => router.back()} />
      <Animated.View entering={FadeIn.duration(350)} style={styles.blockBody}>
        <Text style={[styles.title, { color: awaiting ? colors.onHero : colors.accent }]}>{data.name}</Text>
        <View>
          <View style={styles.factRow}>
            <Text style={[styles.fact, { color: soft }]}>{formatDateRange(data.scheduledStartAt, data.estimatedArrivalAt, era)}</Text>
            {data.totalDistanceKm !== null ? <Text style={[styles.fact, { color: soft }]}>{data.totalDistanceKm} km</Text> : null}
          </View>
          <View style={styles.factRow}>
            <Text style={[styles.fact, { color: ink }]}>
              {t('tripNo')} {data.tripNumber}
            </Text>
            {data.vehicleKey ? (
              <Text style={[styles.fact, { color: soft }]}>
                {t('vehicle')} {data.vehicleKey}
              </Text>
            ) : null}
          </View>
        </View>
        <RouteMap stops={data.stops} geometry={data.routeGeometry} />
        {awaiting ? null : (
          <View style={styles.statusRow}>
            <Ionicons name="ellipsis-horizontal-circle-outline" size={22} color={colors.accent} />
            <Text style={styles.statusLabel}>{t('statusLabel')}</Text>
            <Text style={[styles.statusValue, { color: tone.fg }]}>{statusText}</Text>
          </View>
        )}
      </Animated.View>
    </>
  );

  return (
    <Screen edges={[]}>
      {noHeader}
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={trip.isRefetching} onRefresh={() => void trip.refetch()} />}
      >
        {awaiting ? <Hero style={styles.heroBlock}>{block}</Hero> : <View style={styles.whiteBlock}>{block}</View>}

        <View style={styles.content}>
          <SyncNotice offline={trip.fromCache} />
          {data.startedAt ? (
            <Text style={styles.meta}>
              {t('startedAt')}: {formatDateTime(data.startedAt, era)}
            </Text>
          ) : null}
          {data.completedAt ? (
            <Text style={styles.meta}>
              {t('completedAt')}: {formatDateTime(data.completedAt, era)}
            </Text>
          ) : null}

          {awaiting ? (
            <Animated.View entering={rise(0)} exiting={FadeOut.duration(180)} layout={settle}>
            <Card>
              <Text style={styles.attention}>{t('notAcknowledged')}</Text>
              {rejecting ? (
                <>
                  <Field label={t('rejectReason')} value={reason} onChangeText={setReason} multiline />
                  <Button title={t('rejectConfirm')} disabled={!reason.trim()} onPress={() => answer(false)} />
                  <Button title={t('cancel')} variant="secondary" onPress={() => setRejecting(false)} />
                </>
              ) : (
                <>
                  <Button title={t('accept')} onPress={() => answer(true)} />
                  <Button title={t('reject')} variant="secondary" onPress={() => setRejecting(true)} />
                </>
              )}
            </Card>
            </Animated.View>
          ) : null}

          {data.status === 'IN_TRANSIT' && location.state !== 'granted' ? (
            <Card>
              <Text style={styles.heading}>{t('locationTitle')}</Text>
              <Text style={styles.meta}>{location.state === 'denied' ? t('locationDenied') : t('locationWhy')}</Text>
              {location.state !== 'denied' ? (
                <Button title={t('locationAllow')} onPress={() => void location.request()} />
              ) : null}
            </Card>
          ) : null}
          {data.status === 'IN_TRANSIT' && location.state === 'granted' ? (
            <Banner tone="ok" message={t('locationOn')} />
          ) : null}
          {data.status === 'IN_TRANSIT' && location.state === 'granted' && !background.granted ? (
            <Card>
              <Text style={styles.meta}>{t('locationBackgroundWhy')}</Text>
              <Button title={t('locationBackgroundAllow')} onPress={() => void background.request()} />
            </Card>
          ) : null}

          {step?.action === 'START' ? (
            <Button
              title={t('startTrip')}
              onPress={() =>
                confirm(t('confirmStartTitle'), () =>
                  void offline.enqueue(tripId, { kind: 'START', occurredAt: new Date().toISOString() }),
                )
              }
            />
          ) : null}

          <View style={styles.timeline}>
            {sortedStops(data).map((stop, index, all) => (
              <StopItem
                key={stop.id}
                stop={stop}
                era={era}
                index={index}
                last={index === all.length - 1}
                current={stop.id === next?.id && data.status === 'IN_TRANSIT'}
                onPress={() =>
                  router.push({ pathname: '/trips/[tripId]/stops/[stopId]', params: { tripId, stopId: stop.id } })
                }
              />
            ))}
          </View>

          {step?.action === 'COMPLETE' ? (
            <>
              {step.blockedProofCount > 0 ? (
                <Banner message={t('completeBlocked', { n: step.blockedProofCount })} />
              ) : null}
              <Button
                title={t('completeTrip')}
                disabled={step.blockedProofCount > 0}
                onPress={() =>
                  confirm(t('confirmCompleteTitle'), () =>
                    void offline.enqueue(tripId, { kind: 'COMPLETE', occurredAt: new Date().toISOString() }),
                  )
                }
              />
            </>
          ) : null}

          <Button
            title={t('reportOrNote')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/trips/[tripId]/request', params: { tripId } })}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  loading: { padding: spacing.lg, color: colors.muted, fontSize: 16 },

  // The top block. The gradient one runs under the status bar and has round bottom corners; the plain one is white.
  heroBlock: { padding: 0, gap: 0, borderRadius: 0, borderBottomLeftRadius: radius.card + 4, borderBottomRightRadius: radius.card + 4 },
  whiteBlock: { backgroundColor: colors.surface },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  backButton: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '600' },
  blockBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: '700' },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, minHeight: 26 },
  fact: { fontSize: 15 },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.cardMuted,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  statusLabel: { color: colors.text, fontSize: 16, flex: 1 },
  statusValue: { fontSize: 16, fontWeight: '600' },

  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  attention: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 15 },
  grow: { flex: 1 },

  timeline: { marginTop: spacing.xs },
  stopItem: { flexDirection: 'row', gap: spacing.sm + 2 },
  rail: { width: 26, alignItems: 'center' },
  line: { flex: 1, borderLeftWidth: 2, borderStyle: 'dashed', borderColor: colors.border, marginVertical: 2 },
  stopBody: { flex: 1, paddingBottom: spacing.md, gap: spacing.xs + 2 },
  stopKind: { color: colors.text, fontSize: 17, fontWeight: '700' },
  stopTitle: { color: colors.accent, fontSize: 17, fontWeight: '700' },
  iconLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  divider: { height: 1, backgroundColor: colors.hairline },
  stopWord: { color: colors.text, fontSize: 14, fontWeight: '600' },
  currentStop: { borderColor: colors.accent, borderWidth: 2 },
});
