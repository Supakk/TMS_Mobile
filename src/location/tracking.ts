import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client';
import { sendTracking, type TrackingItem } from '../api/trips';
import { newKey } from '../device';

// Foreground tracking only: samples are batched in memory and sent while the app is open.
// Samples are kept until the server accepts them. Background location and a durable queue come with the outbox.

const MAX_ACCURACY_METERS = 100;
const SAMPLE_INTERVAL_MS = 15_000;
const SAMPLE_DISTANCE_METERS = 25;
const FLUSH_INTERVAL_MS = 30_000;
const MAX_BATCH = 100;
const MAX_BUFFER = 2_000;

export type LocationState = 'unknown' | 'granted' | 'denied';

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

/** While `active`, watches the position and posts it in batches for the trip. */
export function useTripTracking(token: string, tripId: string, active: boolean) {
  const buffer = useRef<TrackingItem[]>([]);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current || buffer.current.length === 0) return;
    flushing.current = true;
    const batch = buffer.current.slice(0, MAX_BATCH);
    try {
      await sendTracking({ token }, tripId, batch);
      buffer.current = buffer.current.slice(batch.length);
    } catch (e) {
      // A network failure keeps the samples for the next flush. A 4xx would fail again forever
      // (for example an implausible GPS jump), so that batch is dropped.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) {
        buffer.current = buffer.current.slice(batch.length);
      }
    } finally {
      flushing.current = false;
    }
  }, [token, tripId]);

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
          buffer.current.push({
            clientEventId: newKey(),
            eventType: 'GPS',
            occurredAt: new Date(position.timestamp).toISOString(),
            latitude,
            longitude,
            // expo-location reports m/s, the API wants km/h; a negative value means unknown.
            speedKph: speed !== null && speed >= 0 ? Math.min(250, Math.round(speed * 3.6 * 10) / 10) : null,
          });
          if (buffer.current.length > MAX_BUFFER) buffer.current.splice(0, buffer.current.length - MAX_BUFFER);
          if (buffer.current.length >= MAX_BATCH) void flush();
        },
      );
      if (cancelled) sub.remove();
      else subscription = sub;
    })().catch(() => undefined);

    const timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    return () => {
      cancelled = true;
      subscription?.remove();
      clearInterval(timer);
      void flush();
    };
  }, [active, flush]);
}
