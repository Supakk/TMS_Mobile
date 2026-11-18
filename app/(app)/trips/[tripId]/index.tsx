import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SyncNotice } from '../../../../src/components/SyncNotice';
import { formatDateTime } from '../../../../src/dates';
import { canAcknowledge, currentStop, sortedStops, stopWord, tripStep, type Stop } from '../../../../src/domain/trip';
import { useAccountId, useSync, useTrip } from '../../../../src/hooks/useTrips';
import { t, tCode, type MessageKey } from '../../../../src/i18n';
import { useLocationPermission, useTripTracking } from '../../../../src/location/tracking';
import { offline } from '../../../../src/offline/manager';
import { useSettings } from '../../../../src/settings/settings';
import { colors, spacing } from '../../../../src/theme';
import { Banner, Button, Card, Field, Row, Screen, SectionTitle, StatusBadge } from '../../../../src/ui';

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

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
      <Text style={styles.stopWord}>{t(`stop${capitalize(stopWord(stop))}` as MessageKey)}</Text>
    </Card>
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
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const data = trip.data;
  const summary = sync.trips.find((x) => x.id === tripId);
  const acknowledged = summary?.acknowledged ?? true;
  const step = data ? tripStep(data) : null;

  // Position is stored and shared only while the trip is on the road and the app is open.
  useTripTracking(accountId, tripId, data?.status === 'IN_TRANSIT' && location.state === 'granted');

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

  if (trip.isLoading) {
    return (
      <Screen edges={[]}>
        <Text style={styles.loading}>{t('loading')}</Text>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen edges={[]}>
        <View style={styles.content}>
          <Banner message={trip.isError ? t('offlineSaved') : t('tripNotFound')} />
          <Button title={t('back')} variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const next = currentStop(data);

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={trip.isRefetching} onRefresh={() => void trip.refetch()} />}
      >
        <SyncNotice offline={trip.fromCache} />
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
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  loading: { padding: spacing.lg, color: colors.muted, fontSize: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  name: { color: colors.text, fontSize: 17 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  attention: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 15 },
  stopTitle: { color: colors.text, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  stopType: { color: colors.muted, fontSize: 14 },
  stopWord: { color: colors.text, fontSize: 15, fontWeight: '600' },
  currentStop: { borderColor: colors.accent, borderWidth: 2 },
});
