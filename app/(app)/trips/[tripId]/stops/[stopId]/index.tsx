import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text } from 'react-native';

import { arrivalStatus } from '../../../../../../src/api/trips';
import { SyncNotice } from '../../../../../../src/components/SyncNotice';
import { formatDateTime } from '../../../../../../src/dates';
import { ARRIVAL_GEOFENCE_METERS, localArrival } from '../../../../../../src/domain/geo';
import { isStopOpen, stopActions, stopWord } from '../../../../../../src/domain/trip';
import { useToken, useTrip } from '../../../../../../src/hooks/useTrips';
import { t, tCode, type MessageKey } from '../../../../../../src/i18n';
import { getLastFix } from '../../../../../../src/location/tracking';
import { offline } from '../../../../../../src/offline/manager';
import { useSettings } from '../../../../../../src/settings/settings';
import { colors, spacing } from '../../../../../../src/theme';
import { Banner, Button, Card, Field, Row, Screen } from '../../../../../../src/ui';

export default function StopScreen() {
  const { tripId, stopId } = useLocalSearchParams<{ tripId: string; stopId: string }>();
  const router = useRouter();
  const token = useToken();
  const { era } = useSettings();
  const trip = useTrip(tripId);
  const [manual, setManual] = useState(false);
  const [reason, setReason] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const data = trip.data;
  const stop = data?.stops.find((x) => x.id === stopId);
  const actions = data && stop ? stopActions(data, stop) : [];
  const wantsCheckIn = actions.includes('CHECK_IN');

  // The phone's own position is the first choice (it works without a signal and is fresher); the server's
  // view is used when the phone has no recent fix. The server still has the final say when the command arrives.
  const server = useQuery({
    queryKey: ['arrival', tripId, stopId],
    queryFn: () => arrivalStatus({ token }, tripId, stopId),
    enabled: wantsCheckIn,
    refetchInterval: 15_000,
    retry: false,
    networkMode: 'always',
  });

  useEffect(() => {
    if (!wantsCheckIn) return;
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [wantsCheckIn]);

  if (!data || !stop) {
    return (
      <Screen edges={[]}>
        <Text style={styles.loading}>{t('loading')}</Text>
      </Screen>
    );
  }

  const local = localArrival(getLastFix(), stop, now);
  const remote = server.data;
  const arrival = local.gpsFresh || !remote ? local : remote;
  const canCheckIn = arrival.canCheckIn;
  const arrivalMessage = !wantsCheckIn
    ? null
    : canCheckIn
      ? t('canCheckIn')
      : !arrival.gpsFresh
        ? t('gpsNotFresh')
        : t('tooFar', { n: ARRIVAL_GEOFENCE_METERS });

  const sendCheckIn = () =>
    void offline
      .enqueue(tripId, {
        kind: 'CHECK_IN',
        stopId,
        occurredAt: new Date().toISOString(),
        manualOverride: manual,
        overrideReason: manual ? reason.trim() : null,
      })
      .then(() => setManual(false));

  const sendCheckOut = () =>
    void offline
      .enqueue(tripId, { kind: 'CHECK_OUT', stopId, occurredAt: new Date().toISOString() })
      .then(() => router.back());

  const word = stopWord(stop);

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={styles.content}>
        <SyncNotice offline={trip.fromCache} />
        <Text style={styles.title}>
          {stop.sequence}. {stop.name}
        </Text>
        <Text style={styles.meta}>{stop.address}</Text>

        <Card>
          <Row
            label={t(`stop${word.charAt(0).toUpperCase()}${word.slice(1)}` as MessageKey)}
            value={tCode('type', stop.stopType)}
          />
          <Row label={t('planned')} value={formatDateTime(stop.plannedArrivalAt, era)} />
          {stop.actualArrivalAt ? <Row label={t('arrivedAt')} value={formatDateTime(stop.actualArrivalAt, era)} /> : null}
          {stop.actualDepartureAt ? (
            <Row label={t('departedAt')} value={formatDateTime(stop.actualDepartureAt, era)} />
          ) : null}
          {stop.podStatus === 'CAPTURED' ? <Row label={t('captureProof')} value={t('proofDone')} /> : null}
        </Card>

        <Button
          title={t('navigate')}
          variant="secondary"
          onPress={() =>
            void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`)
          }
        />

        {data.status === 'IN_TRANSIT' && !isStopOpen(data, stop.id) && !stop.actualDepartureAt ? (
          <Banner message={t('stopLocked')} />
        ) : null}

        {wantsCheckIn ? (
          <>
            {arrivalMessage ? <Banner tone={canCheckIn ? 'ok' : 'warn'} message={arrivalMessage} /> : null}
            {arrival.distanceMeters !== null ? (
              <Row label={t('distanceToStop')} value={t('meters', { n: arrival.distanceMeters })} />
            ) : null}
            {manual ? <Field label={t('manualReason')} value={reason} onChangeText={setReason} multiline /> : null}
            <Button
              title={manual || canCheckIn ? t('checkIn') : t('manualCheckIn')}
              disabled={manual && !reason.trim()}
              onPress={() => {
                if (!canCheckIn && !manual) return setManual(true);
                sendCheckIn();
              }}
            />
          </>
        ) : null}

        {actions.includes('PROOF') ? (
          <Button
            title={t('captureProof')}
            onPress={() =>
              router.push({ pathname: '/trips/[tripId]/stops/[stopId]/pod', params: { tripId, stopId } })
            }
          />
        ) : null}

        {actions.includes('CHECK_OUT') ? (
          <Button
            title={t('checkOut')}
            variant={actions.includes('PROOF') ? 'secondary' : 'primary'}
            onPress={sendCheckOut}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  loading: { padding: spacing.lg, color: colors.muted, fontSize: 16 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 16 },
});
