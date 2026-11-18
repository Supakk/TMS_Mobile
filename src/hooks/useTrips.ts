import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import type { SyncView, TripSummary } from '../api/trips';
import { useSession } from '../auth/session';
import { projectTrip } from '../domain/commands';
import type { Trip } from '../domain/trip';
import { loadSync, loadTrip } from '../offline/repo';
import { offline, summarize, useOutboxRows, useSampleCount } from '../offline/manager';

export const syncKey = (accountId: string) => ['sync', accountId] as const;
export const tripKey = (accountId: string, id: string) => ['trip', accountId, id] as const;

/** The token of the signed-in driver. Screens in the protected group always have one. */
export function useToken(): string {
  const { session } = useSession();
  if (!session) throw new Error('No session');
  return session.token;
}

export function useAccountId(): string {
  const { session } = useSession();
  if (!session) throw new Error('No session');
  return session.account.id;
}

/** The count of work not yet accepted by the server, for the offline indicator. */
export function useOutboxSummary() {
  const accountId = useAccountId();
  const rows = useOutboxRows();
  const samples = useSampleCount();
  return useMemo(() => summarize(rows, accountId, samples), [rows, accountId, samples]);
}

/** Shows a summary as the driver has left it: trip steps that are queued but not yet sent are already applied. */
function projectSummary(summary: TripSummary, rows: ReturnType<typeof useOutboxRows>, accountId: string): TripSummary {
  let next = summary;
  for (const row of rows) {
    if (row.accountId !== accountId || row.tripId !== summary.id) continue;
    if (row.status === 'done' || row.status === 'failed') continue;
    const c = row.command;
    if (c.kind === 'ACK') next = { ...next, acknowledged: true };
    else if (c.kind === 'START') next = { ...next, status: 'IN_TRANSIT' };
    else if (c.kind === 'CHECK_OUT') next = { ...next, completedStopCount: Math.min(next.stopCount, next.completedStopCount + 1) };
    else if (c.kind === 'COMPLETE') next = { ...next, status: 'DELIVERED' };
  }
  return next;
}

/** /me/sync is the source of truth for the list; the saved copy stands in when it cannot be reached. */
export function useSync() {
  const token = useToken();
  const accountId = useAccountId();
  const client = useQueryClient();
  const rows = useOutboxRows();

  const query = useQuery({
    queryKey: syncKey(accountId),
    queryFn: () =>
      loadSync(accountId, token, () => void client.invalidateQueries({ queryKey: ['trip', accountId] })),
    refetchInterval: 60_000,
    networkMode: 'always',
  });

  const trips = useMemo(
    () => (query.data?.data.trips ?? []).map((t) => projectSummary(t, rows, accountId)),
    [query.data, rows, accountId],
  );
  const view: SyncView | undefined = query.data?.data;
  return { ...query, trips, view, fromCache: query.data?.fromCache ?? false, savedAt: query.data?.savedAt ?? null };
}

/** One trip: the server's copy with the driver's queued steps applied. `pending` counts steps still to be sent. */
export function useTrip(tripId: string) {
  const token = useToken();
  const accountId = useAccountId();
  const rows = useOutboxRows();

  const query = useQuery({
    queryKey: tripKey(accountId, tripId),
    queryFn: () => loadTrip(token, tripId),
    refetchInterval: 30_000,
    networkMode: 'always',
  });

  const mine = useMemo(
    () =>
      rows
        .filter((r) => r.accountId === accountId && r.tripId === tripId && r.status !== 'done')
        .sort((a, b) => a.seq - b.seq),
    [rows, accountId, tripId],
  );

  const trip: Trip | undefined = useMemo(
    () => (query.data ? projectTrip(query.data.data, mine) : undefined),
    [query.data, mine],
  );

  return {
    ...query,
    data: trip,
    server: query.data?.data,
    fromCache: query.data?.fromCache ?? false,
    pending: mine.filter((r) => r.status === 'pending' || r.status === 'sending').length,
    failed: mine.filter((r) => r.status === 'failed'),
  };
}

/** Wires the offline manager to React Query: a trip the engine saved replaces the cached server copy. */
export function useOfflineBridge(accountId: string | undefined) {
  const client = useQueryClient();
  useEffect(() => {
    if (!accountId) return;
    offline.onTrip = (trip) =>
      client.setQueryData(tripKey(accountId, trip.id), { data: trip, fromCache: false, savedAt: Date.now() });
    offline.onSettled = () => void client.invalidateQueries({ queryKey: syncKey(accountId) });
  }, [client, accountId]);
}
