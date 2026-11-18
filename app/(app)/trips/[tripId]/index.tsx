import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { acknowledge, completeTrip, startTrip } from '../../../../src/api/trips';
import { formatDateTime } from '../../../../src/dates';
import { canAcknowledge, currentStop, sortedStops, stopWord, tripStep, type Stop } from '../../../../src/domain/trip';
import { getDeviceKey } from '../../../../src/device';
import { useAction } from '../../../../src/hooks/useAction';
import { useSync, useToken, useTrip, useTripCache } from '../../../../src/hooks/useTrips';
import { t, tCode } from '../../../../src/i18n';
import { useTripTracking, useLocationPermission } from '../../../../src/location/tracking';
import { useSettings } from '../../../../src/settings/settings';
import { colors, spacing } from '../../../../src/theme';
import { Banner, Button, Card, ErrorText, Field, Row, SectionTitle, StatusBadge } from '../../../../src/ui';

function StopCard({ stop, current, onPress }: { stop: Stop; current: boolean; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={current ? styles.currentStop : undefined}>
      <View style={styles.cardTop}>
        <Text style={styles.stopTitle}>
          {stop.sequence}. {stop.name}
        </Text>
        <Text style={styles.stopType}>{tCode('type', stop.stopType)}</Text>
      </View>
      <Text style={styles.meta}>{stop.address}</Text>
      <Text style={styles.stopWord}>{t(`stop${capitalize(stopWord(stop))}` as Parameters<typeof t>[0])}</Text>
    </Card>
  );
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export default function TripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const token = useToken();
  const { era } = useSettings();
  const trip = useTrip(tripId);
  const sync = useSync();
  const cache = useTripCache();
  const location = useLocationPermission();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const data = trip.data;
  const summary = sync.data?.trips.find((x) => x.id === tripId);
  const acknowledged = summary?.acknowledged ?? true;
  const step = data ? tripStep(data) : null;
  const onStale = () => cache.refresh(tripId);

  // Position is shared only while the trip is on the road and the app is open.
  useTripTracking(token, tripId, data?.status === 'IN_TRANSIT' && location.state === 'granted');

  const answer = useAction(
    async (_key: string, accepted: boolean) => {
      await acknowledge({ token }, tripId, accepted, accepted ? undefined : reason.trim());
      await sync.refetch();
      setRejecting(false);
    },
    { onStale },
  );

  const start = useAction(
    async (key: string) => {
      const deviceKey = await getDeviceKey();
      const next = await startTrip({ token, version: data!.version, idempotencyKey: key }, tripId, {
        occurredAt: new Date().toISOString(),
        deviceKey,
      });
      cache.store(next);
    },
    { onStale },
  );

  const complete = useAction(
    async (key: string) => {
      const deviceKey = await getDeviceKey();
      const next = await completeTrip({ token, version: data!.version, idempotencyKey: key }, tripId, {
        occurredAt: new Date().toISOString(),
        deviceKey,
      });
      cache.store(next);
    },
    { onStale },
  );

  const confirm = (title: string, run: () => void) =>
    Alert.alert(title, undefined, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('confirm'), onPress: run },
    ]);

  if (trip.isLoading) return <Text style={styles.loading}>{t('loading')}</Text>;
  if (!data) {
    return (
      <View style={styles.content}>
        <Banner message={t('tripNotFound')} />
        <Button title={t('back')} variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const next = currentStop(data);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={trip.isRefetching} onRefresh={() => void trip.refetch()} />}
    >
      <View style={styles.cardTop}>
        <Text style={styles.title}>{data.tripNumber}</Text>
        <StatusBadge status={data.status} />
      </View>
      <Text style={styles.name}>{data.name}</Text>

      <Card>
        <Row label={t('scheduledStart')} value={formatDateTime(data.scheduledStartAt, era)} />
        <Row label={t('estimatedArrival')} value={formatDateTime(data.estimatedArrivalAt, era)} />
        {data.startedAt ? <Row label={t('startedAt')} value={formatDateTime(data.startedAt, era)} /> : null}
        {data.completedAt ? <Row label={t('completedAt')} value={formatDateTime(data.completedAt, era)} /> : null}
        {data.totalDistanceKm !== null ? <Row label={t('distance')} value={`${data.totalDistanceKm} km`} /> : null}
      </Card>

      {canAcknowledge(data, acknowledged) ? (
        <Card>
          <Text style={styles.attention}>{t('notAcknowledged')}</Text>
          {rejecting ? (
            <>
              <Field label={t('rejectReason')} value={reason} onChangeText={setReason} multiline />
              <Button
                title={t('rejectConfirm')}
                busy={answer.busy}
                disabled={!reason.trim()}
                onPress={() => void answer.execute(false)}
              />
              <Button title={t('cancel')} variant="secondary" onPress={() => setRejecting(false)} />
            </>
          ) : (
            <>
              <Button title={t('accept')} busy={answer.busy} onPress={() => void answer.execute(true)} />
              <Button title={t('reject')} variant="secondary" onPress={() => setRejecting(true)} />
            </>
          )}
          <ErrorText message={answer.error} />
        </Card>
      ) : null}

      {data.status === 'IN_TRANSIT' && location.state !== 'granted' ? (
        <Card>
          <Text style={styles.heading}>{t('locationTitle')}</Text>
          <Text style={styles.meta}>{location.state === 'denied' ? t('locationDenied') : t('locationWhy')}</Text>
          {location.state !== 'denied' ? <Button title={t('locationAllow')} onPress={() => void location.request()} /> : null}
        </Card>
      ) : null}
      {data.status === 'IN_TRANSIT' && location.state === 'granted' ? (
        <Banner tone="ok" message={t('locationOn')} />
      ) : null}

      {step?.action === 'START' ? (
        <>
          <Button
            title={t('startTrip')}
            busy={start.busy}
            onPress={() => confirm(t('confirmStartTitle'), () => void start.execute())}
          />
          <ErrorText message={start.error} />
        </>
      ) : null}

      <SectionTitle>{t('stops')}</SectionTitle>
      {sortedStops(data).map((stop) => (
        <StopCard
          key={stop.id}
          stop={stop}
          current={stop.id === next?.id && data.status === 'IN_TRANSIT'}
          onPress={() =>
            router.push({ pathname: '/trips/[tripId]/stops/[stopId]', params: { tripId, stopId: stop.id } })
          }
        />
      ))}

      {step?.action === 'COMPLETE' ? (
        <>
          {step.blockedProofCount > 0 ? <Banner message={t('completeBlocked', { n: step.blockedProofCount })} /> : null}
          <Button
            title={t('completeTrip')}
            busy={complete.busy}
            disabled={step.blockedProofCount > 0}
            onPress={() => confirm(t('confirmCompleteTitle'), () => void complete.execute())}
          />
          <ErrorText message={complete.error} />
        </>
      ) : null}

      <Button
        title={t('reportOrNote')}
        variant="secondary"
        onPress={() => router.push({ pathname: '/trips/[tripId]/request', params: { tripId } })}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  loading: { padding: spacing.lg, color: colors.muted, fontSize: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.accent, fontSize: 26, fontWeight: '700' },
  name: { color: colors.text, fontSize: 17 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  attention: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 15 },
  stopTitle: { color: colors.text, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  stopType: { color: colors.muted, fontSize: 14 },
  stopWord: { color: colors.text, fontSize: 15, fontWeight: '600' },
  currentStop: { borderColor: colors.accent, borderWidth: 2 },
});
