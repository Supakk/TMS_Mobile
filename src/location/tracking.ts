import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import type { Fix } from '../domain/geo';
import { newKey } from '../device';
import { offline } from '../offline/manager';

// Foreground tracking. Every sample is written to the phone's database at once and the offline engine sends
// them in batches when there is a connection, so a drive through a dead zone loses nothing.
// Background location is a later step.

const MAX_ACCURACY_METERS = 100;
const SAMPLE_INTERVAL_MS = 15_000;
const SAMPLE_DISTANCE_METERS = 25;

export type LocationState = 'unknown' | 'granted' | 'denied';

let lastFix: Fix | null = null;

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

/** While `active`, watches the position and stores each good sample for the trip. */
export function useTripTracking(accountId: string, tripId: string, active: boolean) {
  useEffect(() => {
    if (!active) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: SAMPLE_INTERVAL_MS,
          distanceInterval: SAMPLE_DISTANCE_METERS,
        },
        (position) => {
          const { latitude, longitude, accuracy, speed } = position.coords;
          if (accuracy !== null && accuracy > MAX_ACCURACY_METERS) return;
          lastFix = { latitude, longitude, at: position.timestamp };
          void offline.addSamples([
            {
              clientEventId: newKey(),
              tripId,
              accountId,
              eventType: 'GPS',
              occurredAt: new Date(position.timestamp).toISOString(),
              latitude,
              longitude,
              // expo-location reports m/s, the API wants km/h; a negative value means unknown.
              speedKph: speed !== null && speed >= 0 ? Math.min(250, Math.round(speed * 3.6 * 10) / 10) : null,
            },
          ]);
        },
      );
      if (cancelled) sub.remove();
      else subscription = sub;
    })().catch(() => undefined);

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [active, accountId, tripId]);
}
