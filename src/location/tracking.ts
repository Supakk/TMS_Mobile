import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useCallback, useEffect, useState } from 'react';

import type { Fix } from '../domain/geo';
import { newKey } from '../device';
import { t } from '../i18n';
import { offline } from '../offline/manager';
import { readMeta, writeMeta } from '../offline/sqliteStore';

// Tracking while a trip is on the road. Every sample is written to the phone's database at once and the
// offline engine sends them in batches when there is a connection, so a drive through a dead zone loses nothing.
// With background permission the position keeps coming while the app is behind another one or the screen is off
// (an Android foreground service shows a notification while it runs). Without it, only while the app is open.

const MAX_ACCURACY_METERS = 100;
const SAMPLE_INTERVAL_MS = 15_000;
const SAMPLE_DISTANCE_METERS = 25;

export type LocationState = 'unknown' | 'granted' | 'denied';

const BACKGROUND_TASK = 'tms-trip-tracking';
const TARGET_KEY = 'trackingTarget';

type Target = { accountId: string; tripId: string };

let lastFix: Fix | null = null;

function record(target: Target, position: Location.LocationObject) {
  const { latitude, longitude, accuracy, speed } = position.coords;
  if (accuracy !== null && accuracy > MAX_ACCURACY_METERS) return;
  lastFix = { latitude, longitude, at: position.timestamp };
  void offline.addSamples([
    {
      clientEventId: newKey(),
      tripId: target.tripId,
      accountId: target.accountId,
      eventType: 'GPS',
      occurredAt: new Date(position.timestamp).toISOString(),
      latitude,
      longitude,
      // expo-location reports m/s, the API wants km/h; a negative value means unknown.
      speedKph: speed !== null && speed >= 0 ? Math.min(250, Math.round(speed * 3.6 * 10) / 10) : null,
    },
  ]);
}

// Defined at the top level so the system can start it when the app is not on screen. It cannot see any
// screen state, so the trip it records for is read from the database.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(BACKGROUND_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const target = (await readMeta<Target>(TARGET_KEY))?.value;
  if (!target) return;
  for (const position of data.locations) record(target, position);
});

/** The latest good position, for the offline arrival check. */
export function getLastFix(): Fix | null {
  return lastFix;
}

export function useLocationPermission() {
  const [state, setState] = useState<LocationState>('unknown');

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => setState(p.granted ? 'granted' : p.canAskAgain ? 'unknown' : 'denied'))
      .catch(() => setState('unknown'));
  }, []);

  const request = useCallback(async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    setState(p.granted ? 'granted' : 'denied');
  }, []);

  return { state, request };
}

/** Permission to keep sending the position while the app is not on screen. */
export function useBackgroundPermission() {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    Location.getBackgroundPermissionsAsync()
      .then((p) => setGranted(p.granted))
      .catch(() => setGranted(false));
  }, []);

  // On Android 11 and later this opens the system settings page; the driver comes back to the app afterwards.
  const request = useCallback(async () => {
    const p = await Location.requestBackgroundPermissionsAsync();
    setGranted(p.granted);
  }, []);

  return { granted, request };
}

/**
 * While `active`, stores each good position for the trip. With `background` it keeps doing so when the app is
 * not on screen; the foreground service stops when the trip stops being active or this screen goes away.
 */
export function useTripTracking(accountId: string, tripId: string, active: boolean, background = false) {
  useEffect(() => {
    if (!active) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;
    let service = false;
    const target: Target = { accountId, tripId };

    (async () => {
      if (background) {
        await writeMeta(TARGET_KEY, target);
        if (cancelled) return;
        await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: SAMPLE_INTERVAL_MS,
          distanceInterval: SAMPLE_DISTANCE_METERS,
          pausesUpdatesAutomatically: false,
          foregroundService: { notificationTitle: t('appName'), notificationBody: t('locationOn') },
        });
        service = true;
        if (cancelled) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK).catch(() => undefined);
        return;
      }
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: SAMPLE_INTERVAL_MS,
          distanceInterval: SAMPLE_DISTANCE_METERS,
        },
        (position) => record(target, position),
      );
      if (cancelled) sub.remove();
      else subscription = sub;
    })().catch(() => undefined);

    return () => {
      cancelled = true;
      subscription?.remove();
      if (service) void Location.stopLocationUpdatesAsync(BACKGROUND_TASK).catch(() => undefined);
    };
  }, [active, background, accountId, tripId]);
}
