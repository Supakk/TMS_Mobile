import { ApiError, UnknownOutcomeError } from '../api/client';
import { getTrip, sync, type SyncView } from '../api/trips';
import type { Trip } from '../domain/trip';
import { readMeta, sqliteStore, writeMeta } from './sqliteStore';

// Reads go to the network first. When that fails (no signal, a time-out, a server error) the copy saved on
// the phone is used, so the app keeps showing the driver's work. Every good answer refreshes that copy.

const canFallBack = (error: unknown) =>
  error instanceof UnknownOutcomeError || (error instanceof ApiError && error.status >= 500);

export type Loaded<T> = { data: T; fromCache: boolean; savedAt: number | null };

export async function loadSync(accountId: string, token: string, onTrips: () => void): Promise<Loaded<SyncView>> {
  try {
    const data = await sync({ token });
    await writeMeta(`sync:${accountId}`, data);
    void prefetchTrips(token, data, onTrips);
    return { data, fromCache: false, savedAt: Date.now() };
  } catch (error) {
    if (!canFallBack(error)) throw error;
    const cached = await readMeta<SyncView>(`sync:${accountId}`);
    if (!cached) throw error;
    return { data: cached.value, fromCache: true, savedAt: cached.savedAt };
  }
}

export async function loadTrip(token: string, tripId: string): Promise<Loaded<Trip>> {
  try {
    const trip = await getTrip({ token }, tripId);
    await sqliteStore.saveTrip(trip);
    return { data: trip, fromCache: false, savedAt: Date.now() };
  } catch (error) {
    if (!canFallBack(error)) throw error;
    const stored = await sqliteStore.getTrip(tripId);
    if (!stored) throw error;
    return { data: stored, fromCache: true, savedAt: null };
  }
}

/** After a list arrives, save every trip's detail so it opens offline. Only trips whose version changed are fetched. */
async function prefetchTrips(token: string, view: SyncView, onDone: () => void) {
  const wanted = view.trips.filter((t) => t.status !== 'DELIVERED' && t.status !== 'CANCELLED');
  let changed = false;
  for (let i = 0; i < wanted.length; i += 3) {
    await Promise.all(
      wanted.slice(i, i + 3).map(async (summary) => {
        try {
          const stored = await sqliteStore.getTrip(summary.id);
          if (stored && stored.version === summary.version) return;
          await sqliteStore.saveTrip(await getTrip({ token }, summary.id));
          changed = true;
        } catch {
          // Offline again, or the trip moved: the next sync tries again.
        }
      }),
    );
  }
  if (changed) onDone();
}
