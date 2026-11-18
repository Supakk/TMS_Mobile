import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { getTrip, sync } from '../api/trips';
import { useSession } from '../auth/session';
import type { Trip } from '../domain/trip';

export const SYNC_KEY = ['sync'] as const;
export const tripKey = (id: string) => ['trip', id] as const;

/** The token of the signed-in driver. Screens in the protected group always have one. */
export function useToken(): string {
  const { session } = useSession();
  if (!session) throw new Error('No session');
  return session.token;
}

/** /me/sync is the source of truth for the list. It is re-read on focus and on a timer. */
export function useSync() {
  const token = useToken();
  return useQuery({
    queryKey: SYNC_KEY,
    queryFn: () => sync({ token }),
    refetchInterval: 60_000,
  });
}

export function useTrip(tripId: string) {
  const token = useToken();
  return useQuery({
    queryKey: tripKey(tripId),
    queryFn: () => getTrip({ token }, tripId),
    refetchInterval: 30_000,
  });
}

/** Puts a trip returned by a command into the cache and refreshes the list. */
export function useTripCache() {
  const client = useQueryClient();
  const store = useCallback(
    (trip: Trip) => {
      client.setQueryData(tripKey(trip.id), trip);
      void client.invalidateQueries({ queryKey: SYNC_KEY });
    },
    [client],
  );
  const refresh = useCallback(
    (tripId: string) => client.invalidateQueries({ queryKey: tripKey(tripId) }),
    [client],
  );
  return { store, refresh };
}
