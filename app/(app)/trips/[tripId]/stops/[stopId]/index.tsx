import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { arrivalStatus, checkIn, checkOut } from '../../../../../../src/api/trips';
import { formatDateTime } from '../../../../../../src/dates';
import { getDeviceKey } from '../../../../../../src/device';
import { isStopOpen, stopActions, stopWord } from '../../../../../../src/domain/trip';
import { useAction } from '../../../../../../src/hooks/useAction';
import { useToken, useTrip, useTripCache } from '../../../../../../src/hooks/useTrips';
import { t, tCode, type MessageKey } from '../../../../../../src/i18n';
import { useSettings } from '../../../../../../src/settings/settings';
import { colors, spacing } from '../../../../../../src/theme';
import { Banner, Button, Card, ErrorText, Field, Row } from '../../../../../../src/ui';

export default function StopScreen() {
  const { tripId, stopId } = useLocalSearchParams<{ tripId: string; stopId: string }>();
  const router = useRouter();
  const token = useToken();
  const { era } = useSettings();
  const trip = useTrip(tripId);
  const cache = useTripCache();
  const [manual, setManual] = useState(false);
  const [reason, setReason] = useState('');

  const data = trip.data;
  const stop = data?.stops.find((x) => x.id === stopId);
  const actions = data && stop ? stopActions(data, stop) : [];
  const wantsCheckIn = actions.includes('CHECK_IN');

  const arrival = useQuery({
    queryKey: ['arrival', tripId, stopId],
    queryFn: () => arrivalStatus({ token }, tripId, stopId),
    enabled: wantsCheckIn,
    refetchInterval: 15_000,
  });

  const onStale = () => cache.refresh(tripId);

  const doCheckIn = useAction(
    async () => {
      const deviceKey = await getDeviceKey();
      const next = await checkIn({ token, version: data!.version }, tripId, stopId, {
        occurredAt: new Date().toISOString(),
        deviceKey,
        manualOverride: manual,
        overrideReason: manual ? reason.trim() : null,
      });
      cache.store(next);
    },
    { onStale },
  );

  // Check-in and check-out have no idempotency key: after a lost answer a retry gives 412, and
  // onStale re-reads the trip so the driver sees whether the step already happened.
  const doCheckOut = useAction(
    async () => {
      const deviceKey = await getDeviceKey();
      const next = await checkOut({ token, version: data!.version }, tripId, stopId, {
        occurredAt: new Date().toISOString(),
        deviceKey,
      });
      cache.store(next);
      router.back();
    },
    { onStale },
  );

  if (!data || !stop) return <Text style={styles.loading}>{t('loading')}</Text>;

  const canCheckIn = arrival.data?.canCheckIn ?? false;
  const arrivalMessage = !arrival.data
    ? null
    : canCheckIn
      ? t('canCheckIn')
      : !arrival.data.gpsFresh
        ? t('gpsNotFresh')
        : t('tooFar', { n: arrival.data.arrivalGeofenceMeters });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {stop.sequence}. {stop.name}
      </Text>
      <Text style={styles.meta}>{stop.address}</Text>

      <Card>
        <Row label={t(`stop${stopWord(stop)[0].toUpperCase()}${stopWord(stop).slice(1)}` as MessageKey)} value={tCode('type', stop.stopType)} />
        <Row label={t('planned')} value={formatDateTime(stop.plannedArrivalAt, era)} />
        {stop.actualArrivalAt ? <Row label={t('arrivedAt')} value={formatDateTime(stop.actualArrivalAt, era)} /> : null}
        {stop.actualDepartureAt ? <Row label={t('departedAt')} value={formatDateTime(stop.actualDepartureAt, era)} /> : null}
        {stop.podStatus === 'CAPTURED' ? <Row label={t('captureProof')} value={t('proofDone')} /> : null}
      </Card>

      <Button
        title={t('navigate')}
        variant="secondary"
        onPress={() =>
          void Linking.openURL(
            `https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`,
          )
        }
      />

      {data.status === 'IN_TRANSIT' && !isStopOpen(data, stop.id) && !stop.actualDepartureAt ? (
        <Banner message={t('stopLocked')} />
      ) : null}

      {wantsCheckIn ? (
        <>
          {arrivalMessage ? <Banner tone={canCheckIn ? 'ok' : 'warn'} message={arrivalMessage} /> : null}
          {manual ? (
            <Field label={t('manualReason')} value={reason} onChangeText={setReason} multiline />
          ) : null}
          <Button
            title={manual ? t('checkIn') : canCheckIn ? t('checkIn') : t('manualCheckIn')}
            busy={doCheckIn.busy}
            disabled={manual && !reason.trim()}
            onPress={() => {
              if (!canCheckIn && !manual) return setManual(true);
              void doCheckIn.execute();
            }}
          />
          <ErrorText message={doCheckIn.error} />
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
        <>
          <Button
            title={t('checkOut')}
            variant={actions.includes('PROOF') ? 'secondary' : 'primary'}
            busy={doCheckOut.busy}
            onPress={() => void doCheckOut.execute()}
          />
          <ErrorText message={doCheckOut.error} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  loading: { padding: spacing.lg, color: colors.muted, fontSize: 16 },
  title: { color: colors.accent, fontSize: 24, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 16 },
});
